import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Onde ficam os arquivos enviados (PDFs dos processos). Só guarda bytes por caminho; quem pode
 * ler o quê é decidido antes, pelos metadados no banco (com RLS).
 */
export interface ArmazenamentoArquivos {
  readonly nome: string;
  gravar(caminho: string, bytes: Uint8Array, tipo: string): Promise<void>;
  /** null quando o arquivo não existe. */
  ler(caminho: string): Promise<Uint8Array | null>;
  /** Ignora caminhos que não existem. */
  remover(caminhos: string[]): Promise<void>;
}

/** Caminho relativo seguro: só letras, números, "-", "_", "." e "/", sem "..". */
export function validarCaminho(caminho: string): string {
  if (!/^[a-z0-9][a-z0-9/_.-]*$/i.test(caminho) || caminho.includes("..") || caminho.includes("//")) throw new Error(`Caminho de arquivo inválido: ${caminho}`);
  return caminho;
}

export class ArquivosEmMemoria implements ArmazenamentoArquivos {
  readonly nome = "memória";
  readonly dados = new Map<string, Uint8Array>();

  async gravar(caminho: string, bytes: Uint8Array) {
    this.dados.set(validarCaminho(caminho), new Uint8Array(bytes));
  }

  async ler(caminho: string) {
    return this.dados.get(validarCaminho(caminho)) ?? null;
  }

  async remover(caminhos: string[]) {
    for (const c of caminhos) this.dados.delete(validarCaminho(c));
  }
}

/** Arquivos em disco, dentro de `diretorio` (sem Supabase, em desenvolvimento). */
export class ArquivosEmDisco implements ArmazenamentoArquivos {
  readonly nome = "disco";
  private readonly diretorio: string;

  constructor(diretorio: string) {
    this.diretorio = diretorio;
  }

  private completo(caminho: string) {
    return path.join(this.diretorio, validarCaminho(caminho));
  }

  async gravar(caminho: string, bytes: Uint8Array) {
    const destino = this.completo(caminho);
    await mkdir(path.dirname(destino), { recursive: true, mode: 0o700 });
    const temporario = `${destino}.${process.pid}.tmp`;
    await writeFile(temporario, bytes, { mode: 0o600 });
    await rename(temporario, destino);
  }

  async ler(caminho: string) {
    try {
      return new Uint8Array(await readFile(this.completo(caminho)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async remover(caminhos: string[]) {
    await Promise.all(caminhos.map((c) => rm(this.completo(c), { force: true })));
  }
}

type Buscar = typeof fetch;

/**
 * Supabase Storage pela API HTTP, com a chave service_role (só no servidor). O bucket é privado:
 * nada sai dele sem passar pelo app.
 */
export class ArquivosSupabase implements ArmazenamentoArquivos {
  readonly nome = "Supabase Storage";
  private readonly base: string;
  private readonly chave: string;
  private readonly bucket: string;
  private readonly buscar: Buscar;

  constructor(op: { url: string; chave: string; bucket: string; buscar?: Buscar }) {
    this.base = `${op.url.replace(/\/$/, "")}/storage/v1/object`;
    this.chave = op.chave;
    this.bucket = op.bucket;
    this.buscar = op.buscar ?? fetch;
  }

  private cabecalhos(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.chave}`, apikey: this.chave, ...extra };
  }

  private url(caminho: string) {
    return `${this.base}/${encodeURIComponent(this.bucket)}/${validarCaminho(caminho)}`;
  }

  private async falha(r: Response, acao: string): Promise<never> {
    const corpo = (await r.text().catch(() => "")).slice(0, 300);
    throw new Error(`Supabase Storage: falha ao ${acao} (${r.status}) ${corpo}`);
  }

  async gravar(caminho: string, bytes: Uint8Array, tipo: string) {
    const r = await this.buscar(this.url(caminho), {
      method: "POST",
      headers: this.cabecalhos({ "Content-Type": tipo, "x-upsert": "true" }),
      body: new Blob([new Uint8Array(bytes)], { type: tipo }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!r.ok) await this.falha(r, "gravar");
  }

  async ler(caminho: string) {
    const r = await this.buscar(this.url(caminho), { headers: this.cabecalhos(), signal: AbortSignal.timeout(120_000) });
    if (r.status === 404 || r.status === 400) return null;
    if (!r.ok) await this.falha(r, "ler");
    return new Uint8Array(await r.arrayBuffer());
  }

  async remover(caminhos: string[]) {
    if (!caminhos.length) return;
    const r = await this.buscar(`${this.base}/${encodeURIComponent(this.bucket)}`, {
      method: "DELETE",
      headers: this.cabecalhos({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: caminhos.map(validarCaminho) }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) await this.falha(r, "remover");
  }
}
