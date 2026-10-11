import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const dynamic = "force-dynamic";

/** Se a conta está ligada à Google Agenda e como foi a última sincronização. */
export const GET = rotaAutenticada(async ({ usuario }) => NextResponse.json(await container().agenda.estado(usuario.id)));

/** Desliga a Google Agenda desta conta e revoga o acesso no Google. */
export const DELETE = rotaAutenticada(async ({ usuario }) => {
  await container().agenda.desconectar(usuario.id);
  return NextResponse.json(await container().agenda.estado(usuario.id));
});
