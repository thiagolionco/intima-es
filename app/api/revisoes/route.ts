import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const GET = rotaAutenticada(async ({ usuario }) => {
  const c = container();
  const [revisoes, modelos] = await Promise.all([c.revisoes.listar(usuario.id), c.revisoes.listarModelos(usuario.id)]);
  return NextResponse.json({ revisoes, modelos, disponivel: c.revisoes.disponivel });
});

/** Nova revisão: { titulo, perguntas: [{ texto, formato }], processos: [ids] }. */
export const POST = rotaAutenticada(async ({ usuario, corpo }) =>
  NextResponse.json({ revisao: await container().revisoes.criar({ id: usuario.id, nome: usuario.nome }, await corpo()) }, { status: 201 }),
);
