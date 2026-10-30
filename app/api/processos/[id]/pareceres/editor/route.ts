import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** A IA pode levar alguns minutos. */
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

type Params = { id: string };

export const GET = rotaAutenticada(async () => NextResponse.json({ disponivel: container().editorIa.disponivel }));

/** { acao: revisar | melhorar | anonimizar | traduzir, texto, idioma?, orientacao? }. Não grava nada. */
export const POST = rotaAutenticada<Params>(
  async ({ usuario, corpo }, { id }) => NextResponse.json(await container().editorIa.executar(usuario.id, id, await corpo())),
  { limiteCorpo: 256 * 1024 },
);
