import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { id: string };

/** A IA lê os PDFs: pode levar alguns minutos. */
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

/** Se a redação pela IA está ligada no servidor. */
export const GET = rotaAutenticada(async () => NextResponse.json({ disponivel: container().redacaoParecer.disponivel }));

/** Rascunho do parecer: { itens: ids da biblioteca, orientacao? }. Não grava nada: o texto volta para o editor. */
export const POST = rotaAutenticada<Params>(
  async ({ usuario, corpo }, { id }) => NextResponse.json({ rascunho: await container().redacaoParecer.redigir(usuario.id, id, await corpo()) }),
  { limiteCorpo: 16 * 1024 },
);
