import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** A IA pode levar alguns minutos. */
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

type Params = { revisaoId: string };

/** Preenche a linha de um processo: { processoId }. */
export const POST = rotaAutenticada<Params>(async ({ usuario, corpo }, { revisaoId }) => {
  const { processoId } = await corpo<{ processoId?: string }>();
  return NextResponse.json({ linha: await container().revisoes.executar({ id: usuario.id, nome: usuario.nome }, revisaoId, String(processoId ?? "")) });
});
