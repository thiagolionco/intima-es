import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { monitorId: string };

export const PATCH = rotaAutenticada<Params>(async ({ usuario, corpo }, { monitorId }) =>
  NextResponse.json({ monitor: await container().monitor.atualizar(usuario.id, monitorId, await corpo()) }),
);

export const DELETE = rotaAutenticada<Params>(async ({ usuario }, { monitorId }) => {
  await container().monitor.excluir(usuario.id, monitorId);
  return NextResponse.json({ ok: true });
});
