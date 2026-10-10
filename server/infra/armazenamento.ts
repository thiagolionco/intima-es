import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Armazenamento de documentos JSON por chave. É a única peça que sabe onde os dados moram;
 * os repositórios trabalham com qualquer implementação desta interface.
 */
export interface ArmazenamentoDocumentos {
  ler<T>(chave: string, padrao: T): Promise<T>;
  /** Lê, aplica a função e grava de forma atômica, serializando escritas na mesma chave. */
  alterar<T, R = void>(chave: string, padrao: T, fn: (atual: T) => { valor: T; resultado: R } | Promise<{ valor: T; resultado: R }>): Promise<R>;
  remover(chave: string): Promise<void>;
}

/** Fila por chave: garante que duas escritas concorrentes nunca se sobreponham. */
class Filas {
  private readonly filas = new Map<string, Promise<unknown>>();

  executar<R>(chave: string, tarefa: () => Promise<R>): Promise<R> {
    const anterior = this.filas.get(chave) ?? Promise.resolve();
    const atual = anterior.then(tarefa, tarefa);
    const silenciosa = atual.catch(() => undefined);
    this.filas.set(chave, silenciosa);
    silenciosa.then(() => {
      if (this.filas.get(chave) === silenciosa) this.filas.delete(chave);
    });
    return atual;
  }
}

const clonar = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export class ArmazenamentoEmMemoria implements ArmazenamentoDocumentos {
  private readonly dados = new Map<string, unknown>();
  private readonly filas = new Filas();

  async ler<T>(chave: string, padrao: T): Promise<T> {
    return clonar((this.dados.has(chave) ? this.dados.get(chave) : padrao) as T);
  }

  alterar<T, R = void>(chave: string, padrao: T, fn: (atual: T) => { valor: T; resultado: R } | Promise<{ valor: T; resultado: R }>): Promise<R> {
    return this.filas.executar(chave, async () => {
      const { valor, resultado } = await fn(await this.ler(chave, padrao));
      this.dados.set(chave, clonar(valor));
      return resultado;
    });
  }

  async remover(chave: string): Promise<void> {
    this.dados.delete(chave);
  }
}

/**
 * Grava cada chave em um arquivo .json dentro de `diretorio`. A escrita usa arquivo
 * temporário + rename, então um processo interrompido nunca deixa um JSON pela metade.
 */
export class ArmazenamentoEmArquivo implements ArmazenamentoDocumentos {
  private readonly diretorio: string;
  private readonly filas = new Filas();

  constructor(diretorio: string) {
    this.diretorio = diretorio;
  }

  private caminho(chave: string): string {
    if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(chave) || chave.includes("..")) throw new Error(`Chave de armazenamento inválida: ${chave}`);
    return path.join(this.diretorio, `${chave}.json`);
  }

  async ler<T>(chave: string, padrao: T): Promise<T> {
    try {
      return JSON.parse(await readFile(this.caminho(chave), "utf8")) as T;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return clonar(padrao);
      throw e;
    }
  }

  alterar<T, R = void>(chave: string, padrao: T, fn: (atual: T) => { valor: T; resultado: R } | Promise<{ valor: T; resultado: R }>): Promise<R> {
    return this.filas.executar(chave, async () => {
      const { valor, resultado } = await fn(await this.ler(chave, padrao));
      const destino = this.caminho(chave);
      await mkdir(path.dirname(destino), { recursive: true, mode: 0o700 });
      const temp = `${destino}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temp, JSON.stringify(valor), { encoding: "utf8", mode: 0o600 });
      await rename(temp, destino);
      return resultado;
    });
  }

  async remover(chave: string): Promise<void> {
    await this.filas.executar(chave, () => rm(this.caminho(chave), { force: true }));
  }
}
