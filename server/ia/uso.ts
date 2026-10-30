import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Clock } from "../core/clock.ts";
import type { ArmazenamentoDocumentos } from "../infra/armazenamento.ts";

/**
 * Registro do uso da IA: cada chamada à API da Anthropic grava os tokens que gastou, o modelo
 * que respondeu e a função do app que pediu, no escritório de quem pediu. É a base das cotas por
 * plano: o custo em dólar sai daqui, pela tabela de preços abaixo, e não fica gravado.
 */

/** Tokens e buscas de uma chamada, como a API devolve em `usage`. */
export interface UsoDaApi {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

export interface UsoIa {
  /** Função do app (resumo, analise_risco, parecer, revisoes, pesquisa…). */
  funcao: string;
  /** Modelo que respondeu (pode ser o de reserva, quando o principal recusa). */
  modelo: string;
  entrada: number;
  saida: number;
  cacheEscrita: number;
  cacheLeitura: number;
  buscasWeb: number;
}

export interface RegistroUsoIa extends UsoIa {
  id: string;
  usuarioId: string;
  em: string;
}

/** Soma de um escritório por função e modelo, num período. */
export interface SomaUsoIa extends UsoIa {
  escritorioId: string;
  escritorio: string;
  chamadas: number;
}

export interface UsoIaRepository {
  /** Grava no escritório da pessoa. Sem escritório, não grava nada. */
  registrar(r: RegistroUsoIa): Promise<void>;
  /** Somas de todos os escritórios em [desde, ate). Só para administrador da plataforma. */
  somarPorEscritorio(administradorId: string, desde: Date, ate: Date): Promise<SomaUsoIa[]>;
}

/** Dólares por milhão de tokens. Escrita de cache: 1,25 vez a entrada; leitura: 10% da entrada. */
interface Preco {
  entrada: number;
  saida: number;
  cacheEscrita: number;
  cacheLeitura: number;
}

/** Preços da API da Anthropic em outubro de 2026. Modelo fora da lista fica sem custo estimado. */
export const PRECOS: Record<string, Preco> = {
  "claude-opus-5-5": { entrada: 4, saida: 20, cacheEscrita: 5, cacheLeitura: 0.2 },
  "claude-opus-5": { entrada: 5, saida: 25, cacheEscrita: 6.25, cacheLeitura: 0.5 },
  "claude-opus-4-8": { entrada: 5, saida: 25, cacheEscrita: 6.25, cacheLeitura: 0.5 },
  "claude-sonnet-5-5": { entrada: 2, saida: 10, cacheEscrita: 2.5, cacheLeitura: 0.2 },
  "claude-sonnet-5": { entrada: 2, saida: 10, cacheEscrita: 2.5, cacheLeitura: 0.2 },
  "claude-haiku-5-5": { entrada: 0.1, saida: 0.5, cacheEscrita: 0.125, cacheLeitura: 0.01 },
};

/** Cada busca na web custa à parte, além dos tokens (US$ 10 por mil buscas). */
export const PRECO_BUSCA_WEB = 0.01;

/** Custo estimado em dólares, ou null quando o modelo não está na tabela. */
export function custoUsd(u: Pick<UsoIa, "modelo" | "entrada" | "saida" | "cacheEscrita" | "cacheLeitura" | "buscasWeb">): number | null {
  const p = PRECOS[u.modelo];
  if (!p) return null;
  const tokens = u.entrada * p.entrada + u.saida * p.saida + u.cacheEscrita * p.cacheEscrita + u.cacheLeitura * p.cacheLeitura;
  return tokens / 1_000_000 + u.buscasWeb * PRECO_BUSCA_WEB;
}

const inteiro = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

export function deUsoDaApi(funcao: string, modelo: string, u: UsoDaApi): UsoIa {
  return {
    funcao,
    modelo,
    entrada: inteiro(u.input_tokens),
    saida: inteiro(u.output_tokens),
    cacheEscrita: inteiro(u.cache_creation_input_tokens),
    cacheLeitura: inteiro(u.cache_read_input_tokens),
    buscasWeb: inteiro(u.server_tool_use?.web_search_requests),
  };
}

/**
 * A função que aparece no uso de IA: a área da rota (/api/revisoes → revisoes) ou, dentro de um
 * processo, a ferramenta (/api/processos/<id>/linha-do-tempo → linha-do-tempo).
 */
export function funcaoDaRota(caminho: string): string | undefined {
  const [, api, area, , ferramenta, sub] = caminho.split("/");
  if (api !== "api" || !area) return undefined;
  if (area === "processos" && ferramenta) return (sub === "editor" ? "editor" : ferramenta).slice(0, 40);
  return area.slice(0, 40);
}

/** Quem está usando a IA agora e para quê. Posto pela rota autenticada e pelas rotinas automáticas. */
export interface ContextoUsoIa {
  usuarioId: string;
  funcao?: string;
}

const contexto = new AsyncLocalStorage<ContextoUsoIa>();

/** Executa `fn` com as chamadas de IA atribuídas a `usuarioId` (e à função, quando dada). */
export function comUsoIa<R>(usuarioId: string, funcao: string | undefined, fn: () => R): R {
  return contexto.run({ usuarioId, funcao: funcao ?? contexto.getStore()?.funcao }, fn);
}

export function contextoUsoIa(): ContextoUsoIa | undefined {
  return contexto.getStore();
}

/**
 * O que os clientes da API chamam depois de cada resposta. `funcao` dada pelo cliente vale mais
 * que a do contexto (o analisador de risco sabe que é "analise_risco"); sem nenhuma, fica "ia".
 */
export type AnotarUsoIa = (funcao: string | undefined, modelo: string, usage: UsoDaApi | null | undefined) => Promise<void>;

export class MedidorUsoIa {
  private readonly repo: UsoIaRepository;
  private readonly clock: Clock;
  constructor(d: { repo: UsoIaRepository; clock: Clock }) {
    this.repo = d.repo;
    this.clock = d.clock;
  }

  /** Nunca derruba a chamada de IA: uma falha ao gravar só vai para o log. */
  anotar: AnotarUsoIa = async (funcao, modelo, usage) => {
    const ctx = contexto.getStore();
    if (!usage) return;
    if (!ctx) {
      console.warn(`[uso-ia] chamada sem conta associada (${funcao ?? "ia"}, ${modelo}); não registrada.`);
      return;
    }
    const registro: RegistroUsoIa = {
      id: randomUUID(),
      usuarioId: ctx.usuarioId,
      em: this.clock.agora().toISOString(),
      ...deUsoDaApi(funcao ?? ctx.funcao ?? "ia", modelo, usage),
    };
    try {
      await this.repo.registrar(registro);
    } catch (e) {
      console.error("[uso-ia] falha ao registrar:", e instanceof Error ? e.message : e);
    }
  };
}

/** Início do mês "AAAA-MM" no horário de Brasília (UTC-3, sem horário de verão desde 2019). */
export function periodoDoMes(mes: string): { desde: Date; ate: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error("Mês inválido.");
  const ano = Number(m[1]);
  const mesNum = Number(m[2]);
  const desde = new Date(Date.UTC(ano, mesNum - 1, 1, 3));
  const ate = new Date(Date.UTC(ano, mesNum, 1, 3));
  return { desde, ate };
}

/** Quanto tempo a versão em documento guarda (a do Postgres guarda tudo). */
const DIAS_GUARDADOS = 400;
const CHAVE = "uso-ia";

/**
 * Versão em documento (sem DATABASE_URL). Sem Postgres, cada conta é o próprio escritório, como
 * no diretório de contas em documento.
 */
export class UsoIaRepositoryDocumentos implements UsoIaRepository {
  private readonly db: ArmazenamentoDocumentos;
  private readonly clock: Clock;
  private readonly nomeDoEscritorio: (usuarioId: string) => Promise<string>;
  private readonly ehAdministrador: (usuarioId: string) => Promise<boolean>;

  constructor(d: { db: ArmazenamentoDocumentos; clock: Clock; nomeDoEscritorio: (usuarioId: string) => Promise<string>; ehAdministrador: (usuarioId: string) => Promise<boolean> }) {
    this.db = d.db;
    this.clock = d.clock;
    this.nomeDoEscritorio = d.nomeDoEscritorio;
    this.ehAdministrador = d.ehAdministrador;
  }

  registrar(r: RegistroUsoIa) {
    const limite = this.clock.agora().getTime() - DIAS_GUARDADOS * 24 * 60 * 60 * 1000;
    return this.db.alterar<RegistroUsoIa[]>(CHAVE, [], (lista) => ({ valor: [...lista.filter((x) => Date.parse(x.em) >= limite), r], resultado: undefined }));
  }

  async somarPorEscritorio(administradorId: string, desde: Date, ate: Date) {
    if (!(await this.ehAdministrador(administradorId))) throw new Error("Só para administradores.");
    const somas = new Map<string, SomaUsoIa>();
    for (const r of await this.db.ler<RegistroUsoIa[]>(CHAVE, [])) {
      const t = Date.parse(r.em);
      if (t < desde.getTime() || t >= ate.getTime()) continue;
      const k = `${r.usuarioId}|${r.funcao}|${r.modelo}`;
      const s = somas.get(k) ?? { escritorioId: r.usuarioId, escritorio: "", funcao: r.funcao, modelo: r.modelo, chamadas: 0, entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0, buscasWeb: 0 };
      s.chamadas++;
      s.entrada += r.entrada;
      s.saida += r.saida;
      s.cacheEscrita += r.cacheEscrita;
      s.cacheLeitura += r.cacheLeitura;
      s.buscasWeb += r.buscasWeb;
      somas.set(k, s);
    }
    const nomes = new Map<string, string>();
    for (const s of somas.values()) {
      if (!nomes.has(s.escritorioId)) nomes.set(s.escritorioId, await this.nomeDoEscritorio(s.escritorioId));
      s.escritorio = nomes.get(s.escritorioId)!;
    }
    return [...somas.values()];
  }
}

export interface UsoPorFuncao extends UsoIa {
  chamadas: number;
  custoUsd: number | null;
}

export interface UsoDoEscritorio {
  escritorioId: string;
  escritorio: string;
  chamadas: number;
  /** Soma das linhas com preço conhecido. */
  custoUsd: number;
  /** Alguma linha usou modelo fora da tabela de preços (custo subestimado). */
  semPreco: boolean;
  porFuncao: UsoPorFuncao[];
}

/** Agrupa as somas por escritório, do mais caro para o mais barato. */
export function agruparPorEscritorio(somas: SomaUsoIa[]): UsoDoEscritorio[] {
  const porEscritorio = new Map<string, UsoDoEscritorio>();
  for (const { escritorioId, escritorio, ...linha } of somas) {
    const e = porEscritorio.get(escritorioId) ?? { escritorioId, escritorio, chamadas: 0, custoUsd: 0, semPreco: false, porFuncao: [] };
    const custo = custoUsd(linha);
    e.chamadas += linha.chamadas;
    if (custo === null) e.semPreco = true;
    else e.custoUsd += custo;
    e.porFuncao.push({ ...linha, custoUsd: custo });
    porEscritorio.set(escritorioId, e);
  }
  const lista = [...porEscritorio.values()];
  for (const e of lista) e.porFuncao.sort((a, b) => (b.custoUsd ?? 0) - (a.custoUsd ?? 0));
  return lista.sort((a, b) => b.custoUsd - a.custoUsd);
}
