import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** A IA pode levar alguns minutos. */
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

type Params = { pedidoId: string };

export const POST = rotaAutenticada<Params>(async ({ usuario }, { pedidoId }) => NextResponse.json({ pedido: await container().pedidos.triar(usuario.id, pedidoId) }));
