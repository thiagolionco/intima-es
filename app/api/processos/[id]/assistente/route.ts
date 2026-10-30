import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** A IA pode levar alguns minutos. */
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

type Params = { id: string };

export const GET = rotaAutenticada<Params>(async ({ usuario }, { id }) => {
  const c = container();
  return NextResponse.json({ execucoes: await c.agente.listar(usuario.id, id), disponivel: c.agente.disponivel });
});

/** Pedido ao assistente: { pedido }. Devolve o plano; nada é executado ainda. */
export const POST = rotaAutenticada<Params>(async ({ usuario, corpo }, { id }) =>
  NextResponse.json({ execucao: await container().agente.planejar({ id: usuario.id, nome: usuario.nome }, id, await corpo()) }, { status: 201 }),
);
