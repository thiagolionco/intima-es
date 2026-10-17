import { NextResponse } from "next/server";
import { container } from "@/server/container";
import type { DadosConviteNovo } from "@/server/escritorio/escritorio";
import { rotaAutenticada } from "@/server/http/rota";

/** Convida alguém por e-mail para o escritório. Só o dono. */
export const POST = rotaAutenticada(async ({ usuario, corpo, ctx }) => {
  const convite = await container().escritorio.convidar(usuario.id, await corpo<DadosConviteNovo>(), ctx);
  return NextResponse.json({ convite }, { status: 201 });
});
