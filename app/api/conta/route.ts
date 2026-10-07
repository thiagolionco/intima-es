import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { apagarCookieSessao, rotaAutenticada } from "@/server/http/rota";

export const PATCH = rotaAutenticada(async ({ usuario, corpo, ctx }) => {
  const dados = await corpo<{ nome?: string; escritorio?: string; oab?: string }>();
  return NextResponse.json({ usuario: await container().conta.atualizarPerfil(usuario.id, dados, ctx) });
});

/** Exclusão definitiva da conta (exige senha e o e-mail digitado). */
export const DELETE = rotaAutenticada(async ({ usuario, corpo }) => {
  const { senha, confirmacao } = await corpo<{ senha: string; confirmacao: string }>();
  await container().conta.excluir(usuario.id, senha, confirmacao);
  return apagarCookieSessao(NextResponse.json({ ok: true }));
});
