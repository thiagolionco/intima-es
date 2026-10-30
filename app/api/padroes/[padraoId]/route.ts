import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { padraoId: string };

export const PATCH = rotaAutenticada<Params>(async ({ usuario, corpo }, { padraoId }) =>
  NextResponse.json({ padrao: await container().padroes.atualizar(usuario.id, padraoId, await corpo()) }),
);

export const DELETE = rotaAutenticada<Params>(async ({ usuario }, { padraoId }) => {
  await container().padroes.excluir(usuario.id, padraoId);
  return NextResponse.json({ ok: true });
});
