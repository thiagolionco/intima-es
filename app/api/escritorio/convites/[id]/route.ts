import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { id: string };

/** Cancela um convite que ainda não foi aceito. */
export const DELETE = rotaAutenticada<Params>(async ({ usuario }, { id }) => {
  await container().escritorio.revogarConvite(usuario.id, id);
  return NextResponse.json({ ok: true });
});
