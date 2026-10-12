import { createHash } from "node:crypto";
import { type DocumentoProcesso, LIMITES_DOCUMENTO } from "../../lib/processos.ts";
import type { Clock } from "../core/clock.ts";
import { novoId } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import type { ArmazenamentoDocumentos } from "../infra/armazenamento.ts";
import type { ArmazenamentoArquivos } from "../infra/arquivos.ts";
import type { ProcessoRepository } from "./processos.ts";

/** Documento com o caminho dos bytes no armazenamento de arquivos (nunca vai para a tela). */
export interface RegistroDocumento extends DocumentoProcesso {
  caminho: string;
}

/** Metadados dos PDFs. O acesso passa sempre pelo escritório do usuário (RLS no Postgres). */
export interface DocumentoRepository {
  listar(usuarioId: string, processoId: string): Promise<RegistroDocumento[]>;
  porId(usuarioId: string, processoId: string, id: string): Promise<RegistroDocumento | null>;
  /** Lança AppError("conflito", { id }) se o mesmo arquivo já estiver no processo. */
  criar(usuarioId: string, d: RegistroDocumento): Promise<void>;
  /** Devolve o registro apagado, ou null se não existia. */
  excluir(usuarioId: string, processoId: string, id: string): Promise<RegistroDocumento | null>;
  /** Apaga os metadados do processo (no Postgres, o ON DELETE CASCADE já faz isso). */
  excluirDoProcesso(usuarioId: string, processoId: string): Promise<void>;
  /** Caminhos dos arquivos que somem junto com a conta (no Postgres, só se ela for a última do escritório). */
  caminhosDaConta(usuarioId: string): Promise<string[]>;
  excluirDoUsuario(usuarioId: string): Promise<void>;
}

export function documentoRepetido(id?: string): AppError {
  return new AppError("conflito", "Este PDF já está anexado ao processo.", { ...(id ? { id } : {}) });
}

function chave(usuarioId: string) {
  if (!/^[0-9a-f-]{36}$/.test(usuarioId)) throw new Error("Identificador de usuário inválido.");
  return `documentos-processo/${usuarioId}`;
}

/** Versão em documento (sem DATABASE_URL): uma lista por conta. */
export class DocumentoRepositoryDocumentos implements DocumentoRepository {
  private readonly db: ArmazenamentoDocumentos;
  constructor(db: ArmazenamentoDocumentos) {
    this.db = db;
  }

  async listar(usuarioId: string, processoId: string) {
    return (await this.db.ler<RegistroDocumento[]>(chave(usuarioId), [])).filter((d) => d.processoId === processoId);
  }

  async porId(usuarioId: string, processoId: string, id: string) {
    return (await this.listar(usuarioId, processoId)).find((d) => d.id === id) ?? null;
  }

  criar(usuarioId: string, d: RegistroDocumento) {
    return this.db.alterar<RegistroDocumento[]>(chave(usuarioId), [], (lista) => {
      const igual = lista.find((x) => x.processoId === d.processoId && x.hash === d.hash);
      if (igual) throw documentoRepetido(igual.id);
      return { valor: [...lista, d], resultado: undefined };
    });
  }

  excluir(usuarioId: string, processoId: string, id: string) {
    return this.db.alterar<RegistroDocumento[], RegistroDocumento | null>(chave(usuarioId), [], (lista) => {
      const alvo = lista.find((x) => x.processoId === processoId && x.id === id) ?? null;
      return { valor: alvo ? lista.filter((x) => x !== alvo) : lista, resultado: alvo };
    });
  }

  excluirDoProcesso(usuarioId: string, processoId: string) {
    return this.db.alterar<RegistroDocumento[]>(chave(usuarioId), [], (lista) => ({ valor: lista.filter((x) => x.processoId !== processoId), resultado: undefined }));
  }

  async caminhosDaConta(usuarioId: string) {
    return (await this.db.ler<RegistroDocumento[]>(chave(usuarioId), [])).map((d) => d.caminho);
  }

  excluirDoUsuario(usuarioId: string) {
    return this.db.remover(chave(usuarioId));
  }
}

/** O começo de todo PDF. */
const ASSINATURA_PDF = "%PDF-";

function ehPdf(bytes: Uint8Array) {
  // A especificação tolera lixo antes do cabeçalho; os leitores procuram nos primeiros 1024 bytes.
  return Buffer.from(bytes.subarray(0, 1024)).toString("latin1").includes(ASSINATURA_PDF);
}

/** Nome exibido: sem pastas nem caracteres de controle, com no máximo 200 caracteres e terminando em .pdf. */
export function limparNome(nome: string): string {
  const base = (nome ?? "").split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  const semExtensao = base.replace(/\.pdf$/i, "").slice(0, 196) || "documento";
  return `${semExtensao}.pdf`;
}

const naoEncontrado = () => new AppError("nao_encontrado", "Documento não encontrado.");
const idValido = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id);

const publico = ({ caminho: _c, ...d }: RegistroDocumento): DocumentoProcesso => d;

/** PDFs anexados aos processos: metadados no repositório, bytes no armazenamento de arquivos. */
export class DocumentosService {
  private readonly repo: DocumentoRepository;
  private readonly processos: ProcessoRepository;
  private readonly arquivos: ArmazenamentoArquivos;
  private readonly clock: Clock;

  constructor(d: { repo: DocumentoRepository; processos: ProcessoRepository; arquivos: ArmazenamentoArquivos; clock: Clock }) {
    this.repo = d.repo;
    this.processos = d.processos;
    this.arquivos = d.arquivos;
    this.clock = d.clock;
  }

  /** Garante que o processo existe e é do escritório do usuário. */
  private async exigirProcesso(usuarioId: string, processoId: string) {
    if (!idValido(processoId) || !(await this.processos.porId(usuarioId, processoId))) throw new AppError("nao_encontrado", "Processo não encontrado.");
  }

  async listar(usuarioId: string, processoId: string): Promise<DocumentoProcesso[]> {
    await this.exigirProcesso(usuarioId, processoId);
    return (await this.repo.listar(usuarioId, processoId)).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).map(publico);
  }

  async enviar(usuarioId: string, processoId: string, arquivo: { nome: string; bytes: Uint8Array }): Promise<DocumentoProcesso> {
    await this.exigirProcesso(usuarioId, processoId);
    const { bytes } = arquivo;
    if (!bytes.length) throw new AppError("dados_invalidos", "O arquivo está vazio.");
    if (bytes.length > LIMITES_DOCUMENTO.bytes) throw new AppError("dados_invalidos", `O arquivo passa de ${LIMITES_DOCUMENTO.bytes / (1024 * 1024)} MB.`);
    if (!ehPdf(bytes)) throw new AppError("dados_invalidos", "Envie um arquivo PDF.");
    if ((await this.repo.listar(usuarioId, processoId)).length >= LIMITES_DOCUMENTO.porProcesso) {
      throw new AppError("dados_invalidos", `Limite de ${LIMITES_DOCUMENTO.porProcesso} documentos por processo.`);
    }

    const id = novoId();
    const registro: RegistroDocumento = {
      id,
      processoId,
      nome: limparNome(arquivo.nome),
      tamanho: bytes.length,
      hash: createHash("sha256").update(bytes).digest("hex"),
      caminho: `processos/${processoId}/${id}.pdf`,
      criadoEm: this.clock.agora().toISOString(),
    };
    // Grava os bytes antes dos metadados: um documento listado sempre tem arquivo.
    await this.arquivos.gravar(registro.caminho, bytes, "application/pdf");
    try {
      await this.repo.criar(usuarioId, registro);
    } catch (e) {
      await this.arquivos.remover([registro.caminho]).catch(() => undefined);
      throw e;
    }
    return publico(registro);
  }

  async abrir(usuarioId: string, processoId: string, id: string): Promise<{ documento: DocumentoProcesso; bytes: Uint8Array }> {
    const registro = idValido(processoId) && idValido(id) ? await this.repo.porId(usuarioId, processoId, id) : null;
    if (!registro) throw naoEncontrado();
    const bytes = await this.arquivos.ler(registro.caminho);
    if (!bytes) throw naoEncontrado();
    return { documento: publico(registro), bytes };
  }

  async excluir(usuarioId: string, processoId: string, id: string) {
    const registro = idValido(processoId) && idValido(id) ? await this.repo.excluir(usuarioId, processoId, id) : null;
    if (!registro) throw naoEncontrado();
    await this.arquivos.remover([registro.caminho]).catch((e) => console.error("[documentos] arquivo não removido:", registro.caminho, e));
  }

  /** Chamado ao excluir o processo: apaga metadados e arquivos. `caminhos` é lido antes da exclusão. */
  async caminhosDoProcesso(usuarioId: string, processoId: string) {
    return (await this.repo.listar(usuarioId, processoId)).map((d) => d.caminho);
  }

  async aposExcluirProcesso(usuarioId: string, processoId: string, caminhos: string[]) {
    await this.repo.excluirDoProcesso(usuarioId, processoId);
    await this.arquivos.remover(caminhos).catch((e) => console.error("[documentos] arquivos não removidos:", e));
  }

  /** Exclusão da conta. */
  async excluirDaConta(usuarioId: string) {
    const caminhos = await this.repo.caminhosDaConta(usuarioId);
    await this.arquivos.remover(caminhos);
    await this.repo.excluirDoUsuario(usuarioId);
  }
}
