import { NextResponse, type NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO } from "@/lib/auth/cookie";
import { decidirRotaPublica } from "@/lib/publico/rotas";

/** Páginas acessíveis sem login. */
const PUBLICAS = ["/portal", "/pedido", "/seguranca", "/convite", "/cumprir", "/entrar", "/criar-conta", "/esqueci-a-senha", "/redefinir-senha", "/confirmar-email", "/verifique-seu-email", "/dev/caixa-de-saida"];

/**
 * Primeira barreira (runtime edge): sem cookie de sessão não há acesso às páginas internas.
 * A validação real da sessão acontece no servidor, em cada rota da API.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const temSessao = !!req.cookies.get(NOME_COOKIE_SESSAO)?.value;
  const publica = respostaPublica(req, temSessao);
  if (publica) return publica;

  if (pathname.startsWith("/api/")) {
    // /api/rondas/ é chamada por agendadores externos, que se autenticam com RONDA_TOKEN.
    if (pathname.startsWith("/api/auth/") || pathname.startsWith("/api/dev/") || pathname.startsWith("/api/rondas/") || pathname.startsWith("/api/avisos/cumprir") || pathname.startsWith("/api/convite/") || pathname.startsWith("/api/portal-publico/") || pathname.startsWith("/api/pedido-publico/") || temSessao) return NextResponse.next();
    return NextResponse.json({ erro: { codigo: "nao_autenticado", mensagem: "Entre para continuar." } }, { status: 401 });
  }

  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (temSessao) return NextResponse.next();

  const destino = req.nextUrl.clone();
  destino.pathname = "/entrar";
  destino.search = pathname === "/" ? "" : `?para=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(destino);
}

/** Site público e arquivos para agentes: Markdown por Accept, 404 de verdade e "/" sem login. */
function respostaPublica(req: NextRequest, temSessao: boolean): NextResponse | null {
  const decisao = decidirRotaPublica(req.nextUrl.pathname, req.headers.get("accept"), temSessao);
  if (!decisao) return null;
  if (decisao.tipo === "markdown") {
    return new NextResponse(req.method === "HEAD" ? null : decisao.corpo, {
      status: decisao.status,
      headers: { "Content-Type": "text/markdown; charset=utf-8", Vary: "Accept", "Cache-Control": "public, max-age=0, must-revalidate" },
    });
  }
  const res = decisao.tipo === "reescrever" ? NextResponse.rewrite(new URL(decisao.para, req.url)) : NextResponse.next();
  res.headers.set("Vary", "Accept");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
