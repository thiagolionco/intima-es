import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { revisaoId: string };

export const GET = rotaAutenticada<Params>(async ({ usuario }, { revisaoId }) => NextResponse.json({ revisao: await container().revisoes.obter(usuario.id, revisaoId) }));

export const PATCH = rotaAutenticada<Params>(async ({ usuario, corpo }, { revisaoId }) =>
  NextResponse.json({ revisao: await container().revisoes.atualizar(usuario.id, revisaoId, await corpo()) }),
);

export const DELETE = rotaAutenticada<Params>(async ({ usuario }, { revisaoId }) => {
  await container().revisoes.excluir(usuario.id, revisaoId);
  return NextResponse.json({ ok: true });
});
