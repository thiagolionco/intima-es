import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** "Sincronizar agora". */
export const POST = rotaAutenticada(async ({ usuario }) => {
  container().limitador.consumir(`agenda:${usuario.id}`, 20, 60 * 60_000);
  await container()
    .agenda.sincronizar(usuario.id)
    .catch(() => undefined);
  return NextResponse.json(await container().agenda.estado(usuario.id));
});
