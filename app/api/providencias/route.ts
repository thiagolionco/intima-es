import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Providências pendentes de todos os processos, para a tela Hoje. */
export const GET = rotaAutenticada(async ({ usuario }) => NextResponse.json({ pendentes: await container().providencias.pendentes(usuario.id) }));
