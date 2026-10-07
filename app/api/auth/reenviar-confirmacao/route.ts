import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaPublica } from "@/server/http/rota";

export const POST = rotaPublica(async ({ corpo, ctx }) => {
  const { email } = await corpo<{ email: string }>();
  await container().cadastro.reenviarConfirmacao(email, ctx);
  return NextResponse.json({ ok: true }, { status: 202 });
});
