import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { id: string; notaId: string };

export const PATCH = rotaAutenticada<Params>(async ({ usuario, corpo }, { id, notaId }) =>
  NextResponse.json({ nota: await container().linhaDoTempo.alterarNota(usuario.id, id, notaId, await corpo()) }),
);

export const DELETE = rotaAutenticada<Params>(async ({ usuario }, { id, notaId }) => {
  await container().linhaDoTempo.excluirNota(usuario.id, id, notaId);
  return NextResponse.json({ ok: true });
});
