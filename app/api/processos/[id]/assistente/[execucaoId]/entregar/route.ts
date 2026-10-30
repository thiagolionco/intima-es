import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** A IA pode levar alguns minutos. */
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

type Params = { id: string; execucaoId: string };

/** Revisa os resultados contra o pedido e escreve a entrega. */
export const POST = rotaAutenticada<Params>(async ({ usuario }, { id, execucaoId }) =>
  NextResponse.json({ execucao: await container().agente.entregar({ id: usuario.id, nome: usuario.nome }, id, execucaoId) }),
);
