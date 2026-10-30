import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { id: string; execucaoId: string };

export const DELETE = rotaAutenticada<Params>(async ({ usuario }, { id, execucaoId }) => {
  await container().agente.excluir(usuario.id, id, execucaoId);
  return NextResponse.json({ ok: true });
});
