import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { id: string };

/** A IA lê os PDFs: pode levar alguns minutos. */
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

/** Análises de risco, da mais nova para a mais antiga, e se a análise está ligada no servidor. */
export const GET = rotaAutenticada<Params>(async ({ usuario }, { id }) => {
  const c = container();
  return NextResponse.json({ analises: await c.analises.listar(usuario.id, id), disponivel: c.analises.disponivel });
});

/** Nova análise com os PDFs atuais do processo. O autor vem da sessão. */
export const POST = rotaAutenticada<Params>(async ({ usuario }, { id }) =>
  NextResponse.json({ analise: await container().analises.analisar({ id: usuario.id, nome: usuario.nome }, id) }, { status: 201 }),
);
