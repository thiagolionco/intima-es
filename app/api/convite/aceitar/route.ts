import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Aceita o convite com a conta logada (que precisa ter o mesmo e-mail do convite). */
export const POST = rotaAutenticada(async ({ usuario, corpo, ctx }) => {
  const { token } = await corpo<{ token?: unknown }>();
  return NextResponse.json(await container().escritorio.aceitarComConta(usuario, token, ctx));
});
