import { NextResponse, type NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO } from "@/lib/auth/cookie";

/** Páginas acessíveis sem login. */
const PUBLICAS = ["/entrar", "/criar-conta", "/esqueci-a-senha", "/redefinir-senha", "/confirmar-email", "/verifique-seu-email", "/dev/caixa-de-saida"];

/**
 * Primeira barreira (runtime edge): sem cookie de sessão não há acesso às páginas internas.
 * A validação real da sessão acontece no servidor, em cada rota da API.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const temSessao = !!req.cookies.get(NOME_COOKIE_SESSAO)?.value;

  if (pathname.startsWith("/api/")) {
    if (pathname.startsWith("/api/auth/") || pathname.startsWith("/api/dev/") || temSessao) return NextResponse.next();
    return NextResponse.json({ erro: { codigo: "nao_autenticado", mensagem: "Entre para continuar." } }, { status: 401 });
  }

  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (temSessao) return NextResponse.next();

  const destino = req.nextUrl.clone();
  destino.pathname = "/entrar";
  destino.search = pathname === "/" ? "" : `?para=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(destino);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
