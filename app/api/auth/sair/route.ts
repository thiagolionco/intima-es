import { NextResponse } from "next/server";
import { NOME_COOKIE_SESSAO } from "@/lib/auth/cookie";
import { container } from "@/server/container";
import { apagarCookieSessao, rotaPublica } from "@/server/http/rota";

// Pública de propósito: sair com uma sessão já expirada também deve limpar o cookie.
export const POST = rotaPublica(async ({ req, ctx }) => {
  const c = container();
  const valida = await c.sessoes.validar(req.cookies.get(NOME_COOKIE_SESSAO)?.value);
  if (valida) await c.sessoes.sair(valida.sessao, ctx);
  return apagarCookieSessao(NextResponse.json({ ok: true }));
});
