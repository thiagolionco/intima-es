import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaPublica } from "@/server/http/rota";

/** O que o link do convite oferece, para a página mostrar antes do aceite. O token vem no corpo, nunca na URL. */
export const POST = rotaPublica(async ({ corpo, ctx }) => {
  const { token } = await corpo<{ token?: unknown }>();
  return NextResponse.json(await container().escritorio.consultarConvite(token, ctx));
});
