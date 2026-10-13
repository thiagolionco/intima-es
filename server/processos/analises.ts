import type { AnaliseRisco, NivelRisco, PontoAnalise, Processo } from "../../lib/processos.ts";
import type { Clock } from "../core/clock.ts";
import { novoId } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import type { ArmazenamentoDocumentos } from "../infra/armazenamento.ts";
import type { DocumentosService } from "./documentos.ts";
import type { ProcessoRepository } from "./processos.ts";

/** Histórico das análises. O acesso passa sempre pelo escritório do usuário (RLS no Postgres). */
export interface AnaliseRepository {
  listar(usuarioId: string, processoId: string): Promise<AnaliseRisco[]>;
  criar(usuarioId: string, a: AnaliseRisco): Promise<void>;
  /** Apaga as análises do processo (no Postgres, o ON DELETE CASCADE já faz isso). */
  excluirDoProcesso(usuarioId: string, processoId: string): Promise<void>;
  excluirDoUsuario(usuarioId: string): Promise<void>;
}

function chave(usuarioId: string) {
  if (!/^[0-9a-f-]{36}$/.test(usuarioId)) throw new Error("Identificador de usuário inválido.");
  return `analises-processo/${usuarioId}`;
}

/** Versão em documento (sem DATABASE_URL): uma lista por conta. */
export class AnaliseRepositoryDocumentos implements AnaliseRepository {
  private readonly db: ArmazenamentoDocumentos;
  constructor(db: ArmazenamentoDocumentos) {
    this.db = db;
  }

  async listar(usuarioId: string, processoId: string) {
    return (await this.db.ler<AnaliseRisco[]>(chave(usuarioId), [])).filter((a) => a.processoId === processoId);
  }

  criar(usuarioId: string, a: AnaliseRisco) {
    return this.db.alterar<AnaliseRisco[]>(chave(usuarioId), [], (lista) => ({ valor: [...lista, a], resultado: undefined }));
  }

  excluirDoProcesso(usuarioId: string, processoId: string) {
    return this.db.alterar<AnaliseRisco[]>(chave(usuarioId), [], (lista) => ({ valor: lista.filter((x) => x.processoId !== processoId), resultado: undefined }));
  }

  excluirDoUsuario(usuarioId: string) {
    return this.db.remover(chave(usuarioId));
  }
}

/** O que a IA devolve: os documentos são citados pela posição (1, 2, 3…) na lista enviada. */
export interface ResultadoBruto {
  nivel: NivelRisco;
  justificativa: string;
  pontosFortes: { texto: string; documento: number; pagina: number }[];
  pontosFracos: { texto: string; documento: number; pagina: number }[];
}

/** Lê os PDFs e devolve o risco. Sem implementação configurada, a análise fica desligada. */
export interface AnalisadorRisco {
  readonly modelo: string;
  analisar(entrada: { processo: Processo; documentos: { nome: string; bytes: Uint8Array }[] }): Promise<ResultadoBruto>;
}

export const LIMITES_ANALISE = {
  /** Soma dos PDFs enviados numa análise (o pedido à API aceita até 32 MB, já em base64). */
  bytes: 22 * 1024 * 1024,
  documentos: 20,
  pontos: 8,
  caracteresPonto: 500,
  caracteresJustificativa: 2000,
  porDia: 30,
} as const;

const NIVEIS: NivelRisco[] = ["baixo", "medio", "alto", "indeterminado"];

const cortar = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/**
 * Confere a resposta da IA: ponto sem documento e página válidos não entra (o advogado precisa
 * poder conferir cada afirmação no PDF).
 */
export function normalizarResultado(bruto: unknown, documentos: { id: string; nome: string }[]) {
  const r = (bruto && typeof bruto === "object" ? bruto : {}) as Partial<Record<keyof ResultadoBruto, unknown>>;
  const nivel = NIVEIS.includes(r.nivel as NivelRisco) ? (r.nivel as NivelRisco) : "indeterminado";
  const justificativa = typeof r.justificativa === "string" ? cortar(r.justificativa.trim(), LIMITES_ANALISE.caracteresJustificativa) : "";
  const pontos = (lista: unknown): PontoAnalise[] =>
    (Array.isArray(lista) ? lista : [])
      .flatMap((p) => {
        const { texto, documento, pagina } = (p ?? {}) as { texto?: unknown; documento?: unknown; pagina?: unknown };
        const doc = Number.isInteger(documento) ? documentos[(documento as number) - 1] : undefined;
        if (typeof texto !== "string" || !texto.trim() || !doc || !Number.isInteger(pagina) || (pagina as number) < 1) return [];
        return [{ texto: cortar(texto.trim(), LIMITES_ANALISE.caracteresPonto), documentoId: doc.id, documentoNome: doc.nome, pagina: pagina as number }];
      })
      .slice(0, LIMITES_ANALISE.pontos);
  if (!justificativa) throw new Error("A análise voltou sem justificativa.");
  return { nivel, justificativa, pontosFortes: pontos(r.pontosFortes), pontosFracos: pontos(r.pontosFracos) };
}

const idValido = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id);

/** Risco do processo pela IA, a partir dos PDFs anexados. Cada análise fica no histórico. */
export class AnalisesService {
  private readonly repo: AnaliseRepository;
  private readonly processos: ProcessoRepository;
  private readonly documentos: DocumentosService;
  private readonly analisador?: AnalisadorRisco;
  private readonly clock: Clock;
  private readonly limitar: (usuarioId: string) => void;
  /** Processos com análise em andamento nesta instância (evita pagar duas vezes pelo mesmo clique). */
  private readonly emAndamento = new Set<string>();

  constructor(d: {
    repo: AnaliseRepository;
    processos: ProcessoRepository;
    documentos: DocumentosService;
    analisador?: AnalisadorRisco;
    clock: Clock;
    limitar?: (usuarioId: string) => void;
  }) {
    this.repo = d.repo;
    this.processos = d.processos;
    this.documentos = d.documentos;
    this.analisador = d.analisador;
    this.clock = d.clock;
    this.limitar = d.limitar ?? (() => undefined);
  }

  get disponivel(): boolean {
    return !!this.analisador;
  }

  private async exigirProcesso(usuarioId: string, processoId: string): Promise<Processo> {
    const p = idValido(processoId) ? await this.processos.porId(usuarioId, processoId) : null;
    if (!p) throw new AppError("nao_encontrado", "Processo não encontrado.");
    return p;
  }

  /** Da mais nova para a mais antiga. */
  async listar(usuarioId: string, processoId: string): Promise<AnaliseRisco[]> {
    await this.exigirProcesso(usuarioId, processoId);
    return (await this.repo.listar(usuarioId, processoId)).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }

  async analisar(autor: { id: string; nome: string }, processoId: string): Promise<AnaliseRisco> {
    const analisador = this.analisador;
    if (!analisador) throw new AppError("indisponivel", "A análise de risco pela IA não está ligada neste servidor.");
    const processo = await this.exigirProcesso(autor.id, processoId);

    // Os mais recentes primeiro, até o limite de tamanho do pedido.
    const escolhidos: { id: string; nome: string; tamanho: number }[] = [];
    let total = 0;
    for (const d of await this.documentos.listar(autor.id, processoId)) {
      if (escolhidos.length >= LIMITES_ANALISE.documentos) break;
      if (total + d.tamanho > LIMITES_ANALISE.bytes) continue;
      escolhidos.push(d);
      total += d.tamanho;
    }
    if (!escolhidos.length) {
      throw new AppError("dados_invalidos", `Anexe ao menos um PDF de até ${LIMITES_ANALISE.bytes / (1024 * 1024)} MB para a IA analisar.`);
    }

    if (this.emAndamento.has(processoId)) throw new AppError("conflito", "Já há uma análise deste processo em andamento.");
    this.limitar(autor.id);
    this.emAndamento.add(processoId);
    try {
      const arquivos = [];
      for (const d of escolhidos) arquivos.push({ nome: d.nome, bytes: (await this.documentos.abrir(autor.id, processoId, d.id)).bytes });
      const documentos = escolhidos.map(({ id, nome }) => ({ id, nome }));
      let resultado: ReturnType<typeof normalizarResultado>;
      try {
        resultado = normalizarResultado(await analisador.analisar({ processo, documentos: arquivos }), documentos);
      } catch (e) {
        console.error("[analises] falha na análise:", e instanceof Error ? e.message : e);
        throw new AppError("indisponivel", "A IA não conseguiu analisar os documentos agora. Tente de novo em alguns minutos.");
      }
      const analise: AnaliseRisco = {
        id: novoId(),
        processoId,
        ...resultado,
        documentos,
        modelo: analisador.modelo,
        autorId: autor.id,
        autorNome: autor.nome.trim().slice(0, 120) || "Sem nome",
        criadoEm: this.clock.agora().toISOString(),
      };
      await this.repo.criar(autor.id, analise);
      return analise;
    } finally {
      this.emAndamento.delete(processoId);
    }
  }

  excluirDoProcesso(usuarioId: string, processoId: string) {
    return this.repo.excluirDoProcesso(usuarioId, processoId);
  }

  excluirDaConta(usuarioId: string) {
    return this.repo.excluirDoUsuario(usuarioId);
  }
}
