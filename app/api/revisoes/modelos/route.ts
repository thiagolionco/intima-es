import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Salva as perguntas como modelo: { titulo, perguntas }. */
export const POST = rotaAutenticada(async ({ usuario, corpo }) =>
  NextResponse.json({ modelo: await container().revisoes.salvarModelo({ id: usuario.id, nome: usuario.nome }, await corpo()) }, { status: 201 }),
);
