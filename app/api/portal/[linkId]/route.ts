import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { linkId: string };

/** { revogar: true } desliga o link; o resto muda o que ele mostra. */
export const PATCH = rotaAutenticada<Params>(async ({ usuario, corpo }, { linkId }) => {
  const c = container();
  await c.escritorio.exigir(usuario.id, "compartilhar_externo");
  const dados = await corpo<Record<string, unknown>>();
  return NextResponse.json({ link: dados.revogar === true ? await c.portal.revogar(usuario.id, linkId) : await c.portal.atualizar(usuario.id, linkId, dados) });
});

export const DELETE = rotaAutenticada<Params>(async ({ usuario }, { linkId }) => {
  const c = container();
  await c.escritorio.exigir(usuario.id, "compartilhar_externo");
  await c.portal.excluir(usuario.id, linkId);
  return NextResponse.json({ ok: true });
});
