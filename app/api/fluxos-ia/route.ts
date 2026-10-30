import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Fluxos que a pessoa vê (publicados e os rascunhos dela) e as execuções dela. */
export const GET = rotaAutenticada(async ({ usuario }) => {
  const c = container();
  const [fluxos, execucoes] = await Promise.all([c.fluxosIa.listar(usuario.id), c.fluxosIa.listarExecucoes(usuario.id)]);
  return NextResponse.json({ fluxos, execucoes, disponivel: c.fluxosIa.disponivel });
});

/** Novo fluxo: { titulo, instrucoes?, etiquetas, publicado, passos }. */
export const POST = rotaAutenticada(async ({ usuario, corpo }) =>
  NextResponse.json({ fluxo: await container().fluxosIa.criar({ id: usuario.id, nome: usuario.nome }, await corpo()) }, { status: 201 }),
);
