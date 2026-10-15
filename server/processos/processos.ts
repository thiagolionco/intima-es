import { type DadosProcesso, normalizarProcesso, type Processo, validarProcesso } from "../../lib/processos.ts";
import type { Clock } from "../core/clock.ts";
import { novoId } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import type { ArmazenamentoDocumentos } from "../infra/armazenamento.ts";

/** Processos do escritório do usuário. Como o espaço de trabalho, o usuário vem sempre da sessão. */
export interface ProcessoRepository {
  listar(usuarioId: string): Promise<Processo[]>;
  porId(usuarioId: string, id: string): Promise<Processo | null>;
  /** Lança AppError("conflito", { id }) se o número já estiver cadastrado. */
  criar(usuarioId: string, p: Processo): Promise<void>;
  /** Devolve null se o processo não existir. Lança AppError("conflito") se o novo número já for de outro. */
  atualizar(usuarioId: string, id: string, dados: DadosProcesso, agora: string): Promise<Processo | null>;
  /** Devolve false se o processo não existir. */
  excluir(usuarioId: string, id: string): Promise<boolean>;
  /** Apaga tudo o que for só deste usuário (exclusão da conta). */
  excluirDoUsuario(usuarioId: string): Promise<void>;
}

/** `id` é o do processo que já tem o número, quando se sabe qual é. */
export function conflitoDeNumero(id?: string): AppError {
  return new AppError("conflito", "Este processo já está cadastrado.", { campo: "numero", ...(id ? { id } : {}) });
}

function chave(usuarioId: string) {
  if (!/^[0-9a-f-]{36}$/.test(usuarioId)) throw new Error("Identificador de usuário inválido.");
  return `processos/${usuarioId}`;
}

/** Versão em documento (sem DATABASE_URL): uma lista por conta. */
export class ProcessoRepositoryDocumentos implements ProcessoRepository {
  private readonly db: ArmazenamentoDocumentos;
  constructor(db: ArmazenamentoDocumentos) {
    this.db = db;
  }

  listar(usuarioId: string) {
    return this.db.ler<Processo[]>(chave(usuarioId), []);
  }

  async porId(usuarioId: string, id: string) {
    return (await this.listar(usuarioId)).find((p) => p.id === id) ?? null;
  }

  criar(usuarioId: string, p: Processo) {
    return this.db.alterar<Processo[]>(chave(usuarioId), [], (lista) => {
      const existente = p.numero ? lista.find((x) => x.numero === p.numero) : undefined;
      if (existente) throw conflitoDeNumero(existente.id);
      return { valor: [...lista, p], resultado: undefined };
    });
  }

  atualizar(usuarioId: string, id: string, dados: DadosProcesso, agora: string) {
    return this.db.alterar<Processo[], Processo | null>(chave(usuarioId), [], (lista) => {
      const atual = lista.find((x) => x.id === id);
      if (!atual) return { valor: lista, resultado: null };
      const outro = dados.numero ? lista.find((x) => x.numero === dados.numero && x.id !== id) : undefined;
      if (outro) throw conflitoDeNumero(outro.id);
      const novo: Processo = { ...dados, id, criadoEm: atual.criadoEm, atualizadoEm: agora };
      return { valor: lista.map((x) => (x.id === id ? novo : x)), resultado: novo };
    });
  }

  excluir(usuarioId: string, id: string) {
    return this.db.alterar<Processo[], boolean>(chave(usuarioId), [], (lista) => {
      const resto = lista.filter((x) => x.id !== id);
      return { valor: resto, resultado: resto.length !== lista.length };
    });
  }

  excluirDoUsuario(usuarioId: string) {
    return this.db.remover(chave(usuarioId));
  }
}

const naoEncontrado = () => new AppError("nao_encontrado", "Processo não encontrado.");

function dadosValidos(corpo: unknown): DadosProcesso {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Partial<Record<keyof DadosProcesso, unknown>>;
  const erros = validarProcesso(c);
  const [campo] = Object.keys(erros) as (keyof DadosProcesso)[];
  if (campo) throw new AppError("dados_invalidos", erros[campo]!, { campo, erros });
  return normalizarProcesso(c);
}

const idValido = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id);

/** O que mais some quando um processo é excluído (os PDFs anexados). */
export interface DependentesDoProcesso {
  caminhosDoProcesso(usuarioId: string, processoId: string): Promise<string[]>;
  aposExcluirProcesso(usuarioId: string, processoId: string, caminhos: string[]): Promise<void>;
}

/** Regras do cadastro de processos. */
export class ProcessosService {
  private readonly repo: ProcessoRepository;
  private readonly clock: Clock;
  private readonly dependentes?: DependentesDoProcesso;

  constructor(repo: ProcessoRepository, clock: Clock, dependentes?: DependentesDoProcesso) {
    this.repo = repo;
    this.clock = clock;
    this.dependentes = dependentes;
  }

  async listar(usuarioId: string) {
    return (await this.repo.listar(usuarioId)).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
  }

  async obter(usuarioId: string, id: string) {
    const p = idValido(id) ? await this.repo.porId(usuarioId, id) : null;
    if (!p) throw naoEncontrado();
    return p;
  }

  async criar(usuarioId: string, corpo: unknown) {
    const agora = this.clock.agora().toISOString();
    const p: Processo = { ...dadosValidos(corpo), id: novoId(), criadoEm: agora, atualizadoEm: agora };
    await this.repo.criar(usuarioId, p);
    return p;
  }

  async atualizar(usuarioId: string, id: string, corpo: unknown) {
    const dados = dadosValidos(corpo);
    const p = idValido(id) ? await this.repo.atualizar(usuarioId, id, dados, this.clock.agora().toISOString()) : null;
    if (!p) throw naoEncontrado();
    return p;
  }

  async excluir(usuarioId: string, id: string) {
    if (!idValido(id)) throw naoEncontrado();
    // Os caminhos são lidos antes: no Postgres, os metadados somem junto com o processo.
    const caminhos = (await this.dependentes?.caminhosDoProcesso(usuarioId, id)) ?? [];
    if (!(await this.repo.excluir(usuarioId, id))) throw naoEncontrado();
    await this.dependentes?.aposExcluirProcesso(usuarioId, id, caminhos);
  }
}
