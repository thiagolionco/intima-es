import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { pedidoId: string };

/** Status e responsável: { status?, responsavelId? }. */
export const PATCH = rotaAutenticada<Params>(async ({ usuario, corpo }, { pedidoId }) =>
  NextResponse.json({ pedido: await container().pedidos.alterar({ id: usuario.id, nome: usuario.nome }, pedidoId, await corpo()) }),
);

export const DELETE = rotaAutenticada<Params>(async ({ usuario }, { pedidoId }) => {
  await container().pedidos.excluir(usuario.id, pedidoId);
  return NextResponse.json({ ok: true });
});
