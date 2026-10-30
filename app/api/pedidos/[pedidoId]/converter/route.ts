import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { pedidoId: string };

/** Cria um caso em triagem com os dados do pedido. */
export const POST = rotaAutenticada<Params>(async ({ usuario }, { pedidoId }) => NextResponse.json(await container().pedidos.converter({ id: usuario.id, nome: usuario.nome }, pedidoId), { status: 201 }));
