import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Selo de Vigília: última busca automática e dias que ela não conseguiu verificar. */
export const GET = rotaAutenticada(async ({ usuario }) => NextResponse.json({ cobertura: await container().cobertura.resumo(usuario.id) }));
