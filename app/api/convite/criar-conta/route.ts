import { NextResponse } from "next/server";
import { container } from "@/server/container";
import type { DadosContaNova } from "@/server/escritorio/escritorio";
import { rotaPublica } from "@/server/http/rota";

/** Cria a conta de quem foi convidado, já dentro do escritório. Depois a pessoa entra normalmente. */
export const POST = rotaPublica(async ({ corpo, ctx }) => {
  const { token, ...dados } = await corpo<DadosContaNova & { token?: unknown }>();
  return NextResponse.json(await container().escritorio.aceitarComContaNova(token, dados, ctx), { status: 201 });
});
