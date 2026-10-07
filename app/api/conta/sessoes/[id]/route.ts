import { NextResponse } from "next/server";
import { AppError } from "@/server/core/errors";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const DELETE = rotaAutenticada<{ id: string }>(async ({ usuario, sessao, ctx }, params) => {
  if (sessao.id.slice(0, 16) === params.id) throw new AppError("conflito", 'Para encerrar a sessão atual, use "Sair".');
  await container().sessoes.encerrar(usuario.id, params.id, ctx);
  return NextResponse.json({ ok: true });
});
