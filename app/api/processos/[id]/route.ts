import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { id: string };

export const GET = rotaAutenticada<Params>(async ({ usuario }, { id }) => NextResponse.json({ processo: await container().processos.obter(usuario.id, id) }));

export const PUT = rotaAutenticada<Params>(async ({ usuario, corpo }, { id }) => NextResponse.json({ processo: await container().processos.atualizar(usuario.id, id, await corpo(), usuario.nome) }));

export const DELETE = rotaAutenticada<Params>(async ({ usuario }, { id }) => {
  await container().processos.excluir(usuario.id, id);
  return NextResponse.json({ ok: true });
});
