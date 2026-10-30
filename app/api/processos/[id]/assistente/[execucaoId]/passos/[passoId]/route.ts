import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** A IA pode levar alguns minutos. */
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

type Params = { id: string; execucaoId: string; passoId: string };

/** Executa um passo do plano ({ pular: true } pula). */
export const POST = rotaAutenticada<Params>(async ({ usuario, corpo }, { id, execucaoId, passoId }) =>
  NextResponse.json({ execucao: await container().agente.executarPasso({ id: usuario.id, nome: usuario.nome }, id, execucaoId, passoId, await corpo()) }),
);
