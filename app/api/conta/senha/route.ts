import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const POST = rotaAutenticada(async ({ sessao, corpo, ctx }) => {
  const { atual, nova } = await corpo<{ atual: string; nova: string }>();
  return NextResponse.json(await container().conta.alterarSenha(sessao, atual, nova, ctx));
});
