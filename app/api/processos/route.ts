import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Processos do escritório do usuário logado. */
export const GET = rotaAutenticada(async ({ usuario }) => NextResponse.json({ processos: await container().processos.listar(usuario.id) }));

export const POST = rotaAutenticada(async ({ usuario, corpo }) => NextResponse.json({ processo: await container().processos.criar(usuario.id, await corpo()) }, { status: 201 }));
