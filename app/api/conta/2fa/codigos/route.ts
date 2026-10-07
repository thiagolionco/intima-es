import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const POST = rotaAutenticada(async ({ usuario, corpo, ctx }) => {
  const { senha } = await corpo<{ senha: string }>();
  return NextResponse.json(await container().doisFatores.regenerarCodigos(usuario.id, senha, ctx));
});
