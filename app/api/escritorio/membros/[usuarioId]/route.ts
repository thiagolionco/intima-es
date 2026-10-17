import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { usuarioId: string };

/** Muda o papel de alguém do escritório. Só o dono. */
export const PATCH = rotaAutenticada<Params>(async ({ usuario, corpo, ctx }, { usuarioId }) => {
  const { papel } = await corpo<{ papel?: unknown }>();
  await container().escritorio.alterarPapel(usuario.id, usuarioId, papel, ctx);
  return NextResponse.json({ ok: true });
});

/** Tira alguém do escritório (o dono) ou sai dele (a própria pessoa). */
export const DELETE = rotaAutenticada<Params>(async ({ usuario, ctx }, { usuarioId }) => {
  await container().escritorio.remover(usuario.id, usuarioId, ctx);
  return NextResponse.json({ ok: true });
});
