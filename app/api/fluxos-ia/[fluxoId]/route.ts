import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { fluxoId: string };

export const GET = rotaAutenticada<Params>(async ({ usuario }, { fluxoId }) => NextResponse.json({ fluxo: await container().fluxosIa.obter(usuario.id, fluxoId) }));

export const PUT = rotaAutenticada<Params>(async ({ usuario, corpo }, { fluxoId }) =>
  NextResponse.json({ fluxo: await container().fluxosIa.atualizar(usuario.id, fluxoId, await corpo()) }),
);

export const DELETE = rotaAutenticada<Params>(async ({ usuario }, { fluxoId }) => {
  await container().fluxosIa.excluir(usuario.id, fluxoId);
  return NextResponse.json({ ok: true });
});
