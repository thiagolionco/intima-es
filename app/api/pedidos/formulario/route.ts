import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Cria ou troca o link do formulário público ({ titulo?, apresentacao? }). O token volta só agora. */
export const POST = rotaAutenticada(async ({ usuario, corpo }) => {
  const c = container();
  await c.escritorio.exigir(usuario.id, "compartilhar_externo");
  return NextResponse.json(await c.pedidos.gerarFormulario({ id: usuario.id, nome: usuario.nome }, await corpo()), { status: 201 });
});

/** Desliga o formulário público. */
export const DELETE = rotaAutenticada(async ({ usuario }) => {
  const c = container();
  await c.escritorio.exigir(usuario.id, "compartilhar_externo");
  await c.pedidos.desligarFormulario(usuario.id);
  return NextResponse.json({ ok: true });
});
