import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaPublica } from "@/server/http/rota";

/** Botão "Já cumpri" do e-mail: marca a intimação como respondida. O token assinado identifica conta e intimação. */
export const POST = rotaPublica(async ({ corpo, ctx }) => {
  const { token } = await corpo<{ token: string }>();
  container().limitador.consumir(`cumprir:${ctx.ip}`, 30, 60 * 60_000);
  return NextResponse.json(await container().avisos.cumprir(String(token ?? "")));
});
