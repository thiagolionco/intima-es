import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const GET = rotaAutenticada(async ({ usuario }) => NextResponse.json({ links: await container().portal.listar(usuario.id) }));

/** Novo link do portal: { cliente, processoIds?, documentoIds?, titulo?, mensagem?, dias?, mostrarAndamentos?, permitirMensagens? }. */
export const POST = rotaAutenticada(async ({ usuario, corpo }) => {
  const c = container();
  await c.escritorio.exigir(usuario.id, "compartilhar_externo");
  return NextResponse.json(await c.portal.criar({ id: usuario.id, nome: usuario.nome }, await corpo()), { status: 201 });
});
