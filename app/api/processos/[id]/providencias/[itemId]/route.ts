import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { id: string; itemId: string };

export const PATCH = rotaAutenticada<Params>(async ({ usuario, corpo }, { id, itemId }) =>
  NextResponse.json({ providencias: await container().providencias.alterar({ id: usuario.id, nome: usuario.nome }, id, itemId, await corpo()) }),
);

export const DELETE = rotaAutenticada<Params>(async ({ usuario }, { id, itemId }) => NextResponse.json({ providencias: await container().providencias.excluir(usuario.id, id, itemId) }));
