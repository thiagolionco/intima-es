import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** A IA pode levar alguns minutos. */
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

/** Verifica as citações de um texto: { texto, processoId?, pesquisar? }. Com processo, guarda o resultado. */
export const POST = rotaAutenticada(
  async ({ usuario, corpo }) => NextResponse.json({ verificacao: await container().citacoes.verificar({ id: usuario.id, nome: usuario.nome }, await corpo()) }),
  { limiteCorpo: 256 * 1024 },
);
