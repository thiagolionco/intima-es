import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** A IA pode levar alguns minutos. */
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

type Params = { revisaoId: string };

/** Pergunta livre sobre a tabela preenchida: { pergunta }. */
export const POST = rotaAutenticada<Params>(async ({ usuario, corpo }, { revisaoId }) => NextResponse.json(await container().revisoes.perguntar({ id: usuario.id, nome: usuario.nome }, revisaoId, await corpo())));
