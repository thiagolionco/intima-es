import { NextResponse, type NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO } from "@/lib/auth/cookie";
import type { ContextoRequisicao, Sessao, Usuario } from "../auth/model";
import { container, origemDaRequisicao } from "../container";
import { AppError } from "../core/errors";

const LIMITE_CORPO_PADRAO = 64 * 1024;

export interface RequisicaoAnonima {
  req: NextRequest;
  ctx: ContextoRequisicao;
  corpo<T = Record<string, unknown>>(): Promise<T>;
}

export interface RequisicaoAutenticada extends RequisicaoAnonima {
  usuario: Usuario;
  sessao: Sessao;
}

interface Opcoes {
  /** Tamanho máximo do corpo JSON em bytes. */
  limiteCorpo?: number;
}

function contexto(req: NextRequest): ContextoRequisicao {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return { ip: ip.slice(0, 64), userAgent: (req.headers.get("user-agent") || "desconhecido").slice(0, 300) };
}

/**
 * Proteção contra CSRF: requisições que alteram estado precisam vir da mesma origem.
 * Complementa o cookie SameSite=Lax.
 */
function verificarOrigem(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origem = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!origem || !host) throw new AppError("origem_invalida", "Requisição bloqueada: origem ausente.");
  try {
    if (new URL(origem).host !== host) throw new Error();
  } catch {
    throw new AppError("origem_invalida", "Requisição bloqueada: origem diferente da aplicação.");
  }
}

function lerCorpo(req: NextRequest, limite: number) {
  return async <T>() => {
    const texto = await req.text();
    if (Buffer.byteLength(texto) > limite) throw new AppError("dados_invalidos", "Conteúdo grande demais.");
    if (!texto) return {} as T;
    try {
      return JSON.parse(texto) as T;
    } catch {
      throw new AppError("dados_invalidos", "JSON inválido.");
    }
  };
}

export function respostaDeErro(e: unknown): NextResponse {
  if (e instanceof AppError) {
    const headers: Record<string, string> = {};
    const espera = e.detalhes?.aguardarSegundos;
    if (typeof espera === "number") headers["Retry-After"] = String(espera);
    return NextResponse.json({ erro: { codigo: e.codigo, mensagem: e.message, detalhes: e.detalhes } }, { status: e.status, headers });
  }
  console.error("[api] erro inesperado:", e);
  return NextResponse.json({ erro: { codigo: "interno", mensagem: "Erro inesperado no servidor. Tente novamente." } }, { status: 500 });
}

function semCache(resp: Response) {
  resp.headers.set("Cache-Control", "no-store");
  return resp;
}

function executar(req: NextRequest, fn: () => Promise<Response>): Promise<Response> {
  return origemDaRequisicao.run(req.nextUrl.origin, async () => {
    try {
      verificarOrigem(req);
      return semCache(await fn());
    } catch (e) {
      return semCache(respostaDeErro(e));
    }
  });
}

/** Rota pública (login, cadastro…). */
export function rotaPublica(handler: (r: RequisicaoAnonima) => Promise<Response>, opcoes: Opcoes = {}) {
  return (req: NextRequest) => executar(req, () => handler({ req, ctx: contexto(req), corpo: lerCorpo(req, opcoes.limiteCorpo ?? LIMITE_CORPO_PADRAO) }));
}

/** Rota que exige sessão válida; o usuário vem sempre do cookie, nunca do corpo. */
export function rotaAutenticada<P = unknown>(handler: (r: RequisicaoAutenticada, params: P) => Promise<Response>, opcoes: Opcoes = {}) {
  return (req: NextRequest, segmento: { params: Promise<P> }) =>
    executar(req, async () => {
      const valida = await container().sessoes.validar(req.cookies.get(NOME_COOKIE_SESSAO)?.value);
      if (!valida) {
        const resp = respostaDeErro(new AppError("nao_autenticado", "Sua sessão expirou. Entre novamente."));
        resp.cookies.delete(NOME_COOKIE_SESSAO);
        return resp;
      }
      return handler({ req, ctx: contexto(req), corpo: lerCorpo(req, opcoes.limiteCorpo ?? LIMITE_CORPO_PADRAO), ...valida }, await segmento?.params);
    });
}

/** Grava o cookie de sessão. Sem "manter conectado" ele morre ao fechar o navegador. */
export function gravarCookieSessao(resp: NextResponse, token: string, sessao: Sessao) {
  resp.cookies.set(NOME_COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(sessao.lembrar ? { expires: new Date(sessao.expiraEm) } : {}),
  });
  return resp;
}

export function apagarCookieSessao(resp: NextResponse) {
  resp.cookies.set(NOME_COOKIE_SESSAO, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return resp;
}
