"use client";

/** Erro devolvido pela API no formato { erro: { codigo, mensagem, detalhes } }. */
export class ErroApi extends Error {
  readonly codigo: string;
  readonly status: number;
  readonly detalhes: Record<string, unknown>;

  constructor(status: number, codigo: string, mensagem: string, detalhes?: Record<string, unknown>) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes ?? {};
  }

  get campo(): string | undefined {
    return typeof this.detalhes.campo === "string" ? this.detalhes.campo : undefined;
  }
}

type Ouvinte = () => void;
const aoExpirar = new Set<Ouvinte>();

/** O provedor de sessão se inscreve aqui para reagir a qualquer 401 da aplicação. */
export function quandoSessaoExpirar(fn: Ouvinte): () => void {
  aoExpirar.add(fn);
  return () => aoExpirar.delete(fn);
}

export async function api<T = unknown>(url: string, opcoes: { method?: string; body?: unknown; signal?: AbortSignal; silencioso401?: boolean } = {}): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: opcoes.method ?? (opcoes.body === undefined ? "GET" : "POST"),
      headers: opcoes.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: opcoes.body === undefined ? undefined : JSON.stringify(opcoes.body),
      credentials: "same-origin",
      cache: "no-store",
      signal: opcoes.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ErroApi(0, "rede", "Sem conexão com o servidor. Verifique sua internet.");
  }
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const erro = json?.erro ?? {};
    if (resp.status === 401 && erro.codigo === "nao_autenticado" && !opcoes.silencioso401) aoExpirar.forEach((fn) => fn());
    throw new ErroApi(resp.status, erro.codigo ?? "interno", typeof erro === "string" ? erro : (erro.mensagem ?? `Erro ${resp.status}.`), erro.detalhes);
  }
  return json as T;
}
