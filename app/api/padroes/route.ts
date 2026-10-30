import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Padrões do escritório para a IA (os pessoais só de quem pede). */
export const GET = rotaAutenticada(async ({ usuario }) => NextResponse.json({ padroes: await container().padroes.listar(usuario.id) }));

export const POST = rotaAutenticada(async ({ usuario, corpo }) =>
  NextResponse.json({ padrao: await container().padroes.criar({ id: usuario.id, nome: usuario.nome }, await corpo()) }, { status: 201 }),
);
