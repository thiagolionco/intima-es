import { NextResponse } from "next/server";
import { container } from "@/server/container";
import type { DadosCadastro } from "@/server/auth/services/cadastro";
import { rotaPublica } from "@/server/http/rota";

export const POST = rotaPublica(async ({ corpo, ctx }) => {
  const dados = await corpo<DadosCadastro>();
  const { email } = await container().cadastro.cadastrar(dados, ctx);
  return NextResponse.json({ ok: true, email }, { status: 202 });
});
