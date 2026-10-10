import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const POST = rotaAutenticada(async ({ usuario, corpo, ctx }) => {
  const { senha } = await corpo<{ senha: string }>();
  await container().doisFatores.desativar(usuario.id, senha, ctx);
  return NextResponse.json({ ok: true });
});
