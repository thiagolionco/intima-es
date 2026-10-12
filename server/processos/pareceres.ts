import { LIMITES_PARECER, type ParecerProcesso } from "../../lib/processos.ts";
import type { Clock } from "../core/clock.ts";
import { novoId } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import type { ArmazenamentoDocumentos } from "../infra/armazenamento.ts";
import type { ProcessoRepository } from "./processos.ts";

/** Versões do parecer. O acesso passa sempre pelo escritório do usuário (RLS no Postgres). */
export interface ParecerRepository {
  listar(usuarioId: string, processoId: string): Promise<ParecerProcesso[]>;
  /** Lança versaoOcupada() se a versão já existir no processo (outra pessoa salvou antes). */
  criar(usuarioId: string, p: ParecerProcesso): Promise<void>;
  /** Apaga as versões do processo (no Postgres, o ON DELETE CASCADE já faz isso). */
  excluirDoProcesso(usuarioId: string, processoId: string): Promise<void>;
  excluirDoUsuario(usuarioId: string): Promise<void>;
}

export function versaoOcupada(versao?: number): AppError {
  return new AppError("conflito", "Outra versão do parecer foi salva enquanto você editava. Recarregue para ver a mais nova antes de salvar.", {
    ...(versao ? { versao } : {}),
  });
}

function chave(usuarioId: string) {
  if (!/^[0-9a-f-]{36}$/.test(usuarioId)) throw new Error("Identificador de usuário inválido.");
  return `pareceres-processo/${usuarioId}`;
}

/** Versão em documento (sem DATABASE_URL): uma lista por conta. */
export class ParecerRepositoryDocumentos implements ParecerRepository {
  private readonly db: ArmazenamentoDocumentos;
  constructor(db: ArmazenamentoDocumentos) {
    this.db = db;
  }

  async listar(usuarioId: string, processoId: string) {
    return (await this.db.ler<ParecerProcesso[]>(chave(usuarioId), [])).filter((p) => p.processoId === processoId);
  }

  criar(usuarioId: string, p: ParecerProcesso) {
    return this.db.alterar<ParecerProcesso[]>(chave(usuarioId), [], (lista) => {
      if (lista.some((x) => x.processoId === p.processoId && x.versao === p.versao)) throw versaoOcupada();
      return { valor: [...lista, p], resultado: undefined };
    });
  }

  excluirDoProcesso(usuarioId: string, processoId: string) {
    return this.db.alterar<ParecerProcesso[]>(chave(usuarioId), [], (lista) => ({ valor: lista.filter((x) => x.processoId !== processoId), resultado: undefined }));
  }

  excluirDoUsuario(usuarioId: string) {
    return this.db.remover(chave(usuarioId));
  }
}

const idValido = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id);

/** Pareceres do advogado sobre o processo, com histórico: salvar sempre cria uma versão nova. */
export class PareceresService {
  private readonly repo: ParecerRepository;
  private readonly processos: ProcessoRepository;
  private readonly clock: Clock;

  constructor(d: { repo: ParecerRepository; processos: ProcessoRepository; clock: Clock }) {
    this.repo = d.repo;
    this.processos = d.processos;
    this.clock = d.clock;
  }

  private async exigirProcesso(usuarioId: string, processoId: string) {
    if (!idValido(processoId) || !(await this.processos.porId(usuarioId, processoId))) throw new AppError("nao_encontrado", "Processo não encontrado.");
  }

  /** Da versão mais nova para a mais antiga. */
  async listar(usuarioId: string, processoId: string): Promise<ParecerProcesso[]> {
    await this.exigirProcesso(usuarioId, processoId);
    return (await this.repo.listar(usuarioId, processoId)).sort((a, b) => b.versao - a.versao);
  }

  /**
   * Grava uma versão nova. `baseVersao` é a versão que o usuário tinha na tela ao começar a
   * editar (0 quando não havia parecer); se outra já foi salva depois dela, recusa em vez de
   * passar por cima.
   */
  async salvar(autor: { id: string; nome: string }, processoId: string, corpo: unknown): Promise<ParecerProcesso> {
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as { texto?: unknown; baseVersao?: unknown };
    const texto = typeof c.texto === "string" ? c.texto.replace(/\r\n/g, "\n").trim() : "";
    if (!texto) throw new AppError("dados_invalidos", "Escreva o parecer antes de salvar.", { campo: "texto" });
    if (texto.length > LIMITES_PARECER.caracteres) {
      throw new AppError("dados_invalidos", `O parecer passa de ${LIMITES_PARECER.caracteres.toLocaleString("pt-BR")} caracteres.`, { campo: "texto" });
    }
    const base = c.baseVersao ?? 0;
    if (typeof base !== "number" || !Number.isInteger(base) || base < 0) throw new AppError("dados_invalidos", "Versão de origem inválida.");

    await this.exigirProcesso(autor.id, processoId);
    const versoes = await this.repo.listar(autor.id, processoId);
    const atual = versoes.reduce<ParecerProcesso | undefined>((m, p) => (!m || p.versao > m.versao ? p : m), undefined);
    if ((atual?.versao ?? 0) !== base) throw versaoOcupada(atual?.versao);
    if (atual?.texto === texto) throw new AppError("dados_invalidos", "Nada mudou desde a última versão.", { campo: "texto" });
    if (versoes.length >= LIMITES_PARECER.versoes) throw new AppError("dados_invalidos", `Limite de ${LIMITES_PARECER.versoes} versões por processo.`);

    const parecer: ParecerProcesso = {
      id: novoId(),
      processoId,
      versao: base + 1,
      texto,
      autorId: autor.id,
      autorNome: autor.nome.trim().slice(0, 120) || "Sem nome",
      criadoEm: this.clock.agora().toISOString(),
    };
    await this.repo.criar(autor.id, parecer);
    return parecer;
  }

  excluirDoProcesso(usuarioId: string, processoId: string) {
    return this.repo.excluirDoProcesso(usuarioId, processoId);
  }

  excluirDaConta(usuarioId: string) {
    return this.repo.excluirDoUsuario(usuarioId);
  }
}
