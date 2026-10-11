import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaPublica } from "@/server/http/rota";

/** O que o link "Já cumpri" vai marcar, para mostrar antes de confirmar. */
export const POST = rotaPublica(async ({ corpo, ctx }) => {
  const { token } = await corpo<{ token: string }>();
  container().limitador.consumir(`cumprir:${ctx.ip}`, 30, 60 * 60_000);
  return NextResponse.json(await container().avisos.consultar(String(token ?? "")));
});
