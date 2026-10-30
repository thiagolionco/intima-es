import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** A IA pode levar alguns minutos. */
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

type Params = { id: string };

/** Fatos tirados dos PDFs e notas coladas (os andamentos e intimações vêm das rotas de sempre). */
export const GET = rotaAutenticada<Params>(async ({ usuario }, { id }) => {
  const c = container();
  const [fatos, notas] = await Promise.all([c.linhaDoTempo.fatos(usuario.id, id), c.linhaDoTempo.notas(usuario.id, id)]);
  return NextResponse.json({ fatos, notas, disponivel: c.linhaDoTempo.disponivel });
});

/** A IA lê os PDFs e refaz a lista de fatos com data. */
export const POST = rotaAutenticada<Params>(async ({ usuario }, { id }) =>
  NextResponse.json({ fatos: await container().linhaDoTempo.extrairFatos({ id: usuario.id, nome: usuario.nome }, id) }),
);
