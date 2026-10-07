import type { Intimacao, TermoMonitorado } from "../../lib/types.ts";
import type { Clock } from "../core/clock.ts";
import { AppError } from "../core/errors.ts";
import type { ArmazenamentoDocumentos } from "../infra/armazenamento.ts";

/** Os dados de trabalho de um usuário. Cada conta tem o seu, isolado das demais. */
export interface EspacoTrabalho {
  intimacoes: Intimacao[];
  termos: TermoMonitorado[];
  /** Incrementada a cada gravação; usada para detectar edições concorrentes (outra aba). */
  revisao: number;
  atualizadoEm: string | null;
}

export interface EspacoTrabalhoRepository {
  ler(usuarioId: string): Promise<EspacoTrabalho>;
  /** Grava se `revisaoBase` for a atual; caso contrário lança AppError("conflito"). */
  salvar(usuarioId: string, dados: Pick<EspacoTrabalho, "intimacoes" | "termos">, revisaoBase: number): Promise<EspacoTrabalho>;
  excluir(usuarioId: string): Promise<void>;
}

const VAZIO: EspacoTrabalho = { intimacoes: [], termos: [], revisao: 0, atualizadoEm: null };

function chave(usuarioId: string) {
  if (!/^[0-9a-f-]{36}$/.test(usuarioId)) throw new Error("Identificador de usuário inválido.");
  return `espacos/${usuarioId}`;
}

export class EspacoTrabalhoRepositoryDocumentos implements EspacoTrabalhoRepository {
  private readonly db: ArmazenamentoDocumentos;
  private readonly clock: Clock;

  constructor(db: ArmazenamentoDocumentos, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  ler(usuarioId: string) {
    return this.db.ler<EspacoTrabalho>(chave(usuarioId), VAZIO);
  }

  salvar(usuarioId: string, dados: Pick<EspacoTrabalho, "intimacoes" | "termos">, revisaoBase: number) {
    return this.db.alterar<EspacoTrabalho, EspacoTrabalho>(chave(usuarioId), VAZIO, (atual) => {
      if (atual.revisao !== revisaoBase) {
        throw new AppError("conflito", "Seus dados foram alterados em outra aba ou dispositivo.", { revisaoAtual: atual.revisao });
      }
      const novo: EspacoTrabalho = { intimacoes: dados.intimacoes, termos: dados.termos, revisao: atual.revisao + 1, atualizadoEm: this.clock.agora().toISOString() };
      return { valor: novo, resultado: novo };
    });
  }

  excluir(usuarioId: string) {
    return this.db.remover(chave(usuarioId));
  }
}

const MAX_ITENS = 50_000;

function listaDeObjetosComId(v: unknown, nome: string): void {
  if (!Array.isArray(v)) throw new AppError("dados_invalidos", `Campo "${nome}" deve ser uma lista.`);
  if (v.length > MAX_ITENS) throw new AppError("dados_invalidos", `Limite de ${MAX_ITENS} itens em "${nome}".`);
  for (const item of v) {
    if (!item || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string") {
      throw new AppError("dados_invalidos", `Há um item inválido em "${nome}".`);
    }
  }
}

/** Regras do espaço de trabalho; o usuário vem sempre da sessão, nunca do corpo da requisição. */
export class EspacoTrabalhoService {
  private readonly repo: EspacoTrabalhoRepository;

  constructor(repo: EspacoTrabalhoRepository) {
    this.repo = repo;
  }

  carregar(usuarioId: string) {
    return this.repo.ler(usuarioId);
  }

  async salvar(usuarioId: string, corpo: unknown) {
    const c = (corpo ?? {}) as { intimacoes?: unknown; termos?: unknown; revisao?: unknown };
    listaDeObjetosComId(c.intimacoes, "intimacoes");
    listaDeObjetosComId(c.termos, "termos");
    if (typeof c.revisao !== "number" || !Number.isInteger(c.revisao) || c.revisao < 0) throw new AppError("dados_invalidos", "Revisão inválida.");
    return this.repo.salvar(usuarioId, { intimacoes: c.intimacoes as Intimacao[], termos: c.termos as TermoMonitorado[] }, c.revisao);
  }
}
