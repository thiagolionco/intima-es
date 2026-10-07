import { NextResponse } from "next/server";
import { paraPublico } from "@/server/auth/model";
import type { DadosLogin } from "@/server/auth/services/autenticacao";
import { container } from "@/server/container";
import { gravarCookieSessao, rotaPublica } from "@/server/http/rota";

export const POST = rotaPublica(async ({ corpo, ctx }) => {
  const resultado = await container().autenticacao.entrar(await corpo<DadosLogin>(), ctx);
  if (resultado.tipo === "segundo_fator") {
    return NextResponse.json({ etapa: "segundo_fator", desafio: resultado.desafio, expiraEm: resultado.expiraEm });
  }
  return gravarCookieSessao(NextResponse.json({ etapa: "concluido", usuario: paraPublico(resultado.usuario) }), resultado.token, resultado.sessao);
});
