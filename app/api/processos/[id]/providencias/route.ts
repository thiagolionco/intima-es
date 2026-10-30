import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** A IA pode levar alguns minutos. */
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

type Params = { id: string };

export const GET = rotaAutenticada<Params>(async ({ usuario }, { id }) => {
  const c = container();
  return NextResponse.json({ providencias: await c.providencias.obter(usuario.id, id), disponivel: c.providencias.disponivel });
});

/** { extrair: true } pede à IA; senão, inclui uma providência à mão ({ descricao, prazo?, responsavelId? }). */
export const POST = rotaAutenticada<Params>(async ({ usuario, corpo }, { id }) => {
  const c = container();
  const dados = await corpo<Record<string, unknown>>();
  const autor = { id: usuario.id, nome: usuario.nome };
  if (dados.extrair === true) return NextResponse.json({ providencias: await c.providencias.extrair(autor, id) });
  return NextResponse.json({ providencias: await c.providencias.incluir(autor, id, dados) }, { status: 201 });
});
