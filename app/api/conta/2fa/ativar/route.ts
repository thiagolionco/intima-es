import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const POST = rotaAutenticada(async ({ usuario, corpo, ctx }) => {
  const { codigo } = await corpo<{ codigo: string }>();
  return NextResponse.json(await container().doisFatores.ativar(usuario.id, codigo, ctx));
});
