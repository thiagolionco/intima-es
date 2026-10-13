import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Processos do escritório do usuário logado, com o último andamento de cada um no DataJud. */
export const GET = rotaAutenticada(async ({ usuario }) => {
  const c = container();
  const [processos, ultimasMovimentacoes] = await Promise.all([c.processos.listar(usuario.id), c.movimentacoes.ultimas(usuario.id)]);
  return NextResponse.json({ processos, ultimasMovimentacoes });
});

export const POST = rotaAutenticada(async ({ usuario, corpo }) => NextResponse.json({ processo: await container().processos.criar(usuario.id, await corpo()) }, { status: 201 }));
