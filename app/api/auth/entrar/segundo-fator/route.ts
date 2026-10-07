import { NextResponse } from "next/server";
import { paraPublico } from "@/server/auth/model";
import { container } from "@/server/container";
import { gravarCookieSessao, rotaPublica } from "@/server/http/rota";

export const POST = rotaPublica(async ({ corpo, ctx }) => {
  const dados = await corpo<{ desafio: string; codigo: string; recuperacao?: boolean }>();
  const { token, sessao, usuario } = await container().autenticacao.confirmarSegundoFator(dados, ctx);
  return gravarCookieSessao(NextResponse.json({ etapa: "concluido", usuario: paraPublico(usuario) }), token, sessao);
});
