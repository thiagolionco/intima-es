import { createHash } from "node:crypto";
import {
  type ArquivoBiblioteca,
  type DadosItemBiblioteca,
  type FormatoArquivo,
  type ItemBiblioteca,
  LIMITES_BIBLIOTECA,
  normalizarItem,
  TIPO_MIME,
  validarItem,
} from "../../lib/biblioteca.ts";
import type { Clock } from "../core/clock.ts";
import { novoId } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import type { ArmazenamentoDocumentos } from "../infra/armazenamento.ts";
import type { ArmazenamentoArquivos } from "../infra/arquivos.ts";
import { textoDoDocx } from "./docx.ts";

/** Item com o que não vai para a tela: onde estão os bytes e o texto tirado do Word. */
export interface RegistroItem extends Omit<ItemBiblioteca, "arquivo"> {
  arquivo?: ArquivoBiblioteca & { hash: string; caminho: string };
  /** Texto de um .docx, guardado no envio para a IA não precisar abrir o arquivo de novo. */
  textoArquivo?: string;
}

/** Itens da biblioteca. No Postgres, são do escritório inteiro (RLS por escritório). */
export interface BibliotecaRepository {
  listar(usuarioId: string): Promise<RegistroItem[]>;
  porId(usuarioId: string, id: string): Promise<RegistroItem | null>;
  criar(usuarioId: string, item: RegistroItem): Promise<void>;
  /** Devolve o item gravado, ou null se não existia. */
  atualizar(usuarioId: string, id: string, dados: DadosItemBiblioteca, atualizadoEm: string): Promise<RegistroItem | null>;
  /** Devolve o registro apagado, ou null se não existia. */
  excluir(usuarioId: string, id: string): Promise<RegistroItem | null>;
  /** Caminhos dos arquivos que somem junto com a conta (no Postgres, só se ela for a última do escritório). */
  caminhosDaConta(usuarioId: string): Promise<string[]>;
  excluirDoUsuario(usuarioId: string): Promise<void>;
}

function chave(usuarioId: string) {
  if (!/^[0-9a-f-]{36}$/.test(usuarioId)) throw new Error("Identificador de usuário inválido.");
  return `biblioteca/${usuarioId}`;
}

/** Versão em documento (sem DATABASE_URL): uma lista por conta. */
export class BibliotecaRepositoryDocumentos implements BibliotecaRepository {
  private readonly db: ArmazenamentoDocumentos;
  constructor(db: ArmazenamentoDocumentos) {
    this.db = db;
  }

  listar(usuarioId: string) {
    return this.db.ler<RegistroItem[]>(chave(usuarioId), []);
  }

  async porId(usuarioId: string, id: string) {
    return (await this.listar(usuarioId)).find((i) => i.id === id) ?? null;
  }

  criar(usuarioId: string, item: RegistroItem) {
    return this.db.alterar<RegistroItem[]>(chave(usuarioId), [], (lista) => ({ valor: [...lista, item], resultado: undefined }));
  }

  atualizar(usuarioId: string, id: string, dados: DadosItemBiblioteca, atualizadoEm: string) {
    return this.db.alterar<RegistroItem[], RegistroItem | null>(chave(usuarioId), [], (lista) => {
      const alvo = lista.find((i) => i.id === id);
      if (!alvo) return { valor: lista, resultado: null };
      const novo: RegistroItem = { ...semCamposOpcionais(alvo), ...dados, atualizadoEm };
      return { valor: lista.map((i) => (i === alvo ? novo : i)), resultado: novo };
    });
  }

  excluir(usuarioId: string, id: string) {
    return this.db.alterar<RegistroItem[], RegistroItem | null>(chave(usuarioId), [], (lista) => {
      const alvo = lista.find((i) => i.id === id) ?? null;
      return { valor: alvo ? lista.filter((i) => i !== alvo) : lista, resultado: alvo };
    });
  }

  async caminhosDaConta(usuarioId: string) {
    return (await this.listar(usuarioId)).flatMap((i) => (i.arquivo ? [i.arquivo.caminho] : []));
  }

  excluirDoUsuario(usuarioId: string) {
    return this.db.remover(chave(usuarioId));
  }
}

/** Tira os campos editáveis opcionais, para que apagar um deles na edição apague de fato. */
function semCamposOpcionais(i: RegistroItem): RegistroItem {
  const { referencia: _r, tribunal: _t, area: _a, texto: _x, link: _l, ...resto } = i;
  return resto;
}

const idValido = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id);
const naoEncontrado = () => new AppError("nao_encontrado", "Item da biblioteca não encontrado.");

export const publico = ({ arquivo, textoArquivo: _t, ...i }: RegistroItem): ItemBiblioteca => ({
  ...i,
  ...(arquivo ? { arquivo: { nome: arquivo.nome, tamanho: arquivo.tamanho, formato: arquivo.formato } } : {}),
});

function ehPdf(bytes: Uint8Array) {
  return Buffer.from(bytes.subarray(0, 1024)).toString("latin1").includes("%PDF-");
}

/** Nome exibido: sem pastas nem caracteres de controle, com a extensão certa. */
function limparNome(nome: string, formato: FormatoArquivo): string {
  const base = (nome ?? "").split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  const semExtensao = base.replace(/\.(pdf|docx)$/i, "").slice(0, 190) || "documento";
  return `${semExtensao}.${formato}`;
}

function erroDeValidacao(erros: Record<string, string | undefined>): AppError | undefined {
  const [campo, mensagem] = Object.entries(erros).find(([, m]) => m) ?? [];
  return campo && mensagem ? new AppError("dados_invalidos", mensagem, { campo, erros }) : undefined;
}

/** O que a IA lê de cada item: o PDF inteiro ou o texto (colado ou tirado do Word). */
export interface ConteudoParaIa {
  item: ItemBiblioteca;
  pdf?: Uint8Array;
  texto?: string;
}

/** Biblioteca do escritório: metadados no repositório, arquivos no armazenamento de arquivos. */
export class BibliotecaService {
  private readonly repo: BibliotecaRepository;
  private readonly arquivos: ArmazenamentoArquivos;
  private readonly clock: Clock;

  constructor(d: { repo: BibliotecaRepository; arquivos: ArmazenamentoArquivos; clock: Clock }) {
    this.repo = d.repo;
    this.arquivos = d.arquivos;
    this.clock = d.clock;
  }

  /** Os mexidos por último primeiro. */
  async listar(usuarioId: string): Promise<ItemBiblioteca[]> {
    return (await this.repo.listar(usuarioId)).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)).map(publico);
  }

  async criar(autor: { id: string; nome: string }, corpo: Partial<Record<keyof DadosItemBiblioteca, unknown>>, arquivo?: { nome: string; bytes: Uint8Array }): Promise<ItemBiblioteca> {
    const temArquivo = !!arquivo?.bytes.length;
    const erro = erroDeValidacao(validarItem(corpo, temArquivo));
    if (erro) throw erro;
    if ((await this.repo.listar(autor.id)).length >= LIMITES_BIBLIOTECA.porEscritorio) {
      throw new AppError("dados_invalidos", `A biblioteca chegou ao limite de ${LIMITES_BIBLIOTECA.porEscritorio} itens.`);
    }

    const id = novoId();
    const agora = this.clock.agora().toISOString();
    const registro: RegistroItem = {
      id,
      ...normalizarItem(corpo),
      autorId: autor.id,
      autorNome: autor.nome.trim().slice(0, 120) || "Sem nome",
      criadoEm: agora,
      atualizadoEm: agora,
    };
    if (arquivo && temArquivo) {
      const { bytes } = arquivo;
      if (bytes.length > LIMITES_BIBLIOTECA.bytes) throw new AppError("dados_invalidos", `O arquivo passa de ${LIMITES_BIBLIOTECA.bytes / (1024 * 1024)} MB.`, { campo: "arquivo" });
      let formato: FormatoArquivo;
      if (ehPdf(bytes)) formato = "pdf";
      else {
        const texto = textoDoDocx(bytes);
        if (texto === null) throw new AppError("dados_invalidos", "Envie um PDF ou um documento do Word (.docx).", { campo: "arquivo" });
        formato = "docx";
        if (texto) registro.textoArquivo = texto.slice(0, LIMITES_BIBLIOTECA.textoArquivo);
      }
      registro.arquivo = {
        nome: limparNome(arquivo.nome, formato),
        tamanho: bytes.length,
        formato,
        hash: createHash("sha256").update(bytes).digest("hex"),
        caminho: `biblioteca/${id}.${formato}`,
      };
      // Bytes antes dos metadados: um item listado sempre tem arquivo.
      await this.arquivos.gravar(registro.arquivo.caminho, bytes, TIPO_MIME[formato]);
    }
    try {
      await this.repo.criar(autor.id, registro);
    } catch (e) {
      if (registro.arquivo) await this.arquivos.remover([registro.arquivo.caminho]).catch(() => undefined);
      throw e;
    }
    return publico(registro);
  }

  /** Edita os dados do item. O arquivo não muda: para trocar, exclua e envie de novo. */
  async atualizar(usuarioId: string, id: string, corpo: Partial<Record<keyof DadosItemBiblioteca, unknown>>): Promise<ItemBiblioteca> {
    const atual = idValido(id) ? await this.repo.porId(usuarioId, id) : null;
    if (!atual) throw naoEncontrado();
    const erro = erroDeValidacao(validarItem(corpo, !!atual.arquivo));
    if (erro) throw erro;
    const salvo = await this.repo.atualizar(usuarioId, id, normalizarItem(corpo), this.clock.agora().toISOString());
    if (!salvo) throw naoEncontrado();
    return publico(salvo);
  }

  async abrir(usuarioId: string, id: string): Promise<{ arquivo: ArquivoBiblioteca; bytes: Uint8Array }> {
    const registro = idValido(id) ? await this.repo.porId(usuarioId, id) : null;
    if (!registro?.arquivo) throw naoEncontrado();
    const bytes = await this.arquivos.ler(registro.arquivo.caminho);
    if (!bytes) throw naoEncontrado();
    const { nome, tamanho, formato } = registro.arquivo;
    return { arquivo: { nome, tamanho, formato }, bytes };
  }

  async excluir(usuarioId: string, id: string) {
    const registro = idValido(id) ? await this.repo.excluir(usuarioId, id) : null;
    if (!registro) throw naoEncontrado();
    if (registro.arquivo) {
      await this.arquivos.remover([registro.arquivo.caminho]).catch((e) => console.error("[biblioteca] arquivo não removido:", registro.arquivo?.caminho, e));
    }
  }

  /** Conteúdo dos itens escolhidos, na ordem pedida, para a IA ler. Ignora ids que não existem. */
  async paraIa(usuarioId: string, ids: string[]): Promise<ConteudoParaIa[]> {
    const todos = new Map((await this.repo.listar(usuarioId)).map((i) => [i.id, i]));
    const saida: ConteudoParaIa[] = [];
    for (const id of ids) {
      const r = todos.get(id);
      if (!r) continue;
      const pdf = r.arquivo?.formato === "pdf" ? await this.arquivos.ler(r.arquivo.caminho) : null;
      const texto = [r.texto, r.textoArquivo].filter(Boolean).join("\n\n");
      saida.push({ item: publico(r), ...(pdf ? { pdf } : {}), ...(texto ? { texto } : {}) });
    }
    return saida;
  }

  /** Exclusão da conta. */
  async excluirDaConta(usuarioId: string) {
    const caminhos = await this.repo.caminhosDaConta(usuarioId);
    await this.arquivos.remover(caminhos);
    await this.repo.excluirDoUsuario(usuarioId);
  }
}
