import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { fluxoId: string };

/** Prepara uma execução: { processos: [ids], contexto? }. Os passos rodam em /avancar. */
export const POST = rotaAutenticada<Params>(async ({ usuario, corpo }, { fluxoId }) =>
  NextResponse.json({ execucao: await container().fluxosIa.iniciar({ id: usuario.id, nome: usuario.nome }, fluxoId, await corpo()) }, { status: 201 }),
);
