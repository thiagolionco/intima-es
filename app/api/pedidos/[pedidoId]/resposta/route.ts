import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** A IA pode levar alguns minutos. */
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

type Params = { pedidoId: string };

/** Rascunho da resposta ao interessado. Nada é enviado. */
export const POST = rotaAutenticada<Params>(async ({ usuario }, { pedidoId }) => NextResponse.json(await container().pedidos.rascunhoResposta(usuario.id, pedidoId)));
