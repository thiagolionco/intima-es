import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** A IA pode levar alguns minutos. */
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

type Params = { execucaoId: string };

/** Faz a próxima parte do fluxo: { pular? }. A tela chama de novo enquanto estiver rodando. */
export const POST = rotaAutenticada<Params>(async ({ usuario, corpo }, { execucaoId }) =>
  NextResponse.json({ execucao: await container().fluxosIa.avancar({ id: usuario.id, nome: usuario.nome }, execucaoId, await corpo().catch(() => ({}))) }),
);
