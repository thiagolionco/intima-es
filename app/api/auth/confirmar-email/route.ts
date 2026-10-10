import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaPublica } from "@/server/http/rota";

export const POST = rotaPublica(async ({ corpo, ctx }) => {
  const { token } = await corpo<{ token: string }>();
  return NextResponse.json(await container().cadastro.confirmarEmail(token, ctx));
});
