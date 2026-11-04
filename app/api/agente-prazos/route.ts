import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Se a IA está ligada (sem ela, o agente responde pelas regras simples). */
export const GET = rotaAutenticada(async () => NextResponse.json({ disponivel: container().agentePrazos.disponivel }));

/** Agente de Prazos: { intimacaoId, semIa? } → proposta de tarefa e prazo, já conferida. Não grava nada. */
export const POST = rotaAutenticada(async ({ usuario, corpo }) => NextResponse.json(await container().agentePrazos.propor(usuario.id, await corpo())));
