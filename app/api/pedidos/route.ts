import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const GET = rotaAutenticada(async ({ usuario }) => {
  const c = container();
  const [pedidos, formulario] = await Promise.all([c.pedidos.listar(usuario.id), c.pedidos.formulario(usuario.id)]);
  return NextResponse.json({ pedidos, formulario, triagemDisponivel: c.pedidos.triagemDisponivel });
});

/** Pedido cadastrado à mão (telefonema, conversa): { nome, contato, assunto, descricao }. */
export const POST = rotaAutenticada(async ({ usuario, corpo }) =>
  NextResponse.json({ pedido: await container().pedidos.criarManual({ id: usuario.id, nome: usuario.nome }, await corpo()) }, { status: 201 }),
);
