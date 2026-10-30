import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { modeloId: string };

export const DELETE = rotaAutenticada<Params>(async ({ usuario }, { modeloId }) => {
  await container().revisoes.excluirModelo(usuario.id, modeloId);
  return NextResponse.json({ ok: true });
});
