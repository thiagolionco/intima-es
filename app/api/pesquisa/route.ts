import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** A IA pode levar alguns minutos. */
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

export const GET = rotaAutenticada(async () => NextResponse.json({ disponivel: container().pesquisa.disponivel }));

/** Pesquisa jurídica pela IA nas fontes oficiais: { pergunta }. */
export const POST = rotaAutenticada(async ({ usuario, corpo }) => NextResponse.json({ resultado: await container().pesquisa.pesquisar(usuario.id, await corpo()) }));
