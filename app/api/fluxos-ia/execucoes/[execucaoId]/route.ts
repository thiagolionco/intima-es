import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { execucaoId: string };

export const GET = rotaAutenticada<Params>(async ({ usuario }, { execucaoId }) => NextResponse.json({ execucao: await container().fluxosIa.obterExecucao(usuario.id, execucaoId) }));

export const DELETE = rotaAutenticada<Params>(async ({ usuario }, { execucaoId }) => {
  await container().fluxosIa.excluirExecucao(usuario.id, execucaoId);
  return NextResponse.json({ ok: true });
});
