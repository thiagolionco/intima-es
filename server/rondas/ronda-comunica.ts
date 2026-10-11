import type { IntimacaoImportada } from "../../lib/comunica.ts";
import { mesclarImportadas } from "../../lib/importacao.ts";
import { somarDias } from "../../lib/prazos/datas.ts";
import type { Intimacao, TermoMonitorado, TipoTermo } from "../../lib/types.ts";
import { type BuscarPagina, buscarEmJanelas } from "../comunica/busca.ts";
import type { Clock } from "../core/clock.ts";
import { AppError } from "../core/errors.ts";
import type { EspacoTrabalhoRepository } from "../workspace/espaco-trabalho.ts";

/** Tipos de termo procurados sozinhos. Nomes de parte e de advogado são lentos demais no Comunica. */
export const TIPOS_AUTOMATICOS: TipoTermo[] = ["oab", "processo"];
/** Na primeira ronda de um termo, quantos dias para trás procurar. */
const DIAS_PRIMEIRA_RONDA = 7;
/** Nunca procurar mais que isto para trás, mesmo depois de muito tempo sem ronda. */
const DIAS_MAXIMOS = 30;

export interface ResultadoRondaTermo {
  termoId: string;
  apelido: string;
  novas: number;
  erro?: string;
}

export interface NovaNaRonda {
  usuarioId: string;
  intimacao: Intimacao;
}

export interface DepsRonda {
  espacos: EspacoTrabalhoRepository;
  /** Contas que entram na ronda. */
  listarUsuarios: () => Promise<string[]>;
  buscarPagina: BuscarPagina;
  clock: Clock;
  novoId: () => string;
  /** Tempo total de busca por termo, em ms. */
  orcamentoPorTermoMs?: number;
  /** Chamado com as intimações novas de cada conta, depois de gravadas (ex.: avisos). */
  aoEncontrar?: (novas: NovaNaRonda[]) => Promise<void>;
}

/** Data de hoje no fuso de Brasília, que é o das datas de disponibilização do DJEN. */
export function hojeEmBrasilia(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export function periodoDaRonda(t: Pick<TermoMonitorado, "ultimaRonda">, hoje: string): { inicio: string; fim: string } {
  const limite = somarDias(hoje, -DIAS_MAXIMOS);
  // Repete o último dia já coberto: o DJEN pode publicar mais comunicações nele depois da ronda.
  const desejado = t.ultimaRonda?.ate ? somarDias(t.ultimaRonda.ate, -1) : somarDias(hoje, -DIAS_PRIMEIRA_RONDA);
  return { inicio: desejado < limite ? limite : desejado > hoje ? hoje : desejado, fim: hoje };
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Procura no Comunica, sem ninguém pedir, as comunicações dos termos de OAB e processo ativos
 * de cada conta e as junta ao acervo (sem duplicar e já com o prazo calculado).
 */
export class RondaComunica {
  private readonly d: DepsRonda;
  private readonly emAndamento = new Set<string>();

  constructor(deps: DepsRonda) {
    this.d = deps;
  }

  async doUsuario(usuarioId: string): Promise<ResultadoRondaTermo[]> {
    if (this.emAndamento.has(usuarioId)) throw new AppError("conflito", "Já há uma busca automática em andamento para esta conta.");
    this.emAndamento.add(usuarioId);
    try {
      return await this.executar(usuarioId);
    } finally {
      this.emAndamento.delete(usuarioId);
    }
  }

  /** Roda para todas as contas, uma de cada vez para não sobrecarregar o Comunica. */
  async todos(): Promise<{ contas: number; novas: number; erros: number }> {
    let novas = 0;
    let erros = 0;
    const ids = await this.d.listarUsuarios();
    for (const id of ids) {
      try {
        const r = await this.doUsuario(id);
        novas += r.reduce((s, x) => s + x.novas, 0);
        erros += r.filter((x) => x.erro).length;
      } catch (e) {
        erros++;
        console.error(`[ronda] falha na conta ${id}:`, mensagem(e));
      }
    }
    return { contas: ids.length, novas, erros };
  }

  private async executar(usuarioId: string): Promise<ResultadoRondaTermo[]> {
    const inicial = await this.d.espacos.ler(usuarioId);
    const termos = inicial.termos.filter((t) => t.ativo && TIPOS_AUTOMATICOS.includes(t.tipo));
    if (!termos.length) return [];

    const agora = this.d.clock.agora();
    const hoje = hojeEmBrasilia(agora);
    const achados = new Map<string, { itens: IntimacaoImportada[]; ate?: string; erro?: string }>();
    for (const t of termos) {
      const periodo = periodoDaRonda(t, hoje);
      try {
        const r = await buscarEmJanelas({ termo: t, dataInicio: periodo.inicio, dataFim: periodo.fim }, this.d.buscarPagina, {
          diasPorJanela: 7,
          maxItens: 500,
          orcamentoMs: this.d.orcamentoPorTermoMs ?? 60_000,
        });
        // Resultado incompleto: guarda o que veio, mas não avança a data, para a próxima ronda completar.
        achados.set(t.id, { itens: r.itens, ate: r.truncado ? t.ultimaRonda?.ate : hoje, erro: r.truncado ? r.aviso : undefined });
      } catch (e) {
        achados.set(t.id, { itens: [], ate: t.ultimaRonda?.ate, erro: mensagem(e) });
      }
    }

    // Grava sobre a versão mais recente; se alguém gravou no meio do caminho, relê e tenta de novo.
    for (let tentativa = 0; ; tentativa++) {
      const espaco = tentativa === 0 ? inicial : await this.d.espacos.ler(usuarioId);
      let lista = espaco.intimacoes;
      const novasDaConta: Intimacao[] = [];
      const resultados: ResultadoRondaTermo[] = [];
      const termosAtualizados = espaco.termos.map((t) => {
        const a = achados.get(t.id);
        if (!a) return t;
        const m = mesclarImportadas(lista, a.itens, t.apelido, { suspensoes: espaco.suspensoes ?? [], agora: agora.toISOString(), novoId: this.d.novoId });
        lista = m.lista;
        novasDaConta.push(...m.novas);
        resultados.push({ termoId: t.id, apelido: t.apelido, novas: m.novas.length, erro: a.erro });
        return { ...t, ultimaRonda: { em: agora.toISOString(), ate: a.ate, novas: m.novas.length, erro: a.erro } };
      });
      try {
        await this.d.espacos.salvar(usuarioId, { intimacoes: lista, termos: termosAtualizados, suspensoes: espaco.suspensoes }, espaco.revisao);
      } catch (e) {
        if (e instanceof AppError && e.codigo === "conflito" && tentativa < 4) continue;
        throw e;
      }
      if (novasDaConta.length && this.d.aoEncontrar) {
        await this.d.aoEncontrar(novasDaConta.map((intimacao) => ({ usuarioId, intimacao }))).catch((e) => console.error("[ronda] falha ao avisar:", mensagem(e)));
      }
      return resultados;
    }
  }
}
