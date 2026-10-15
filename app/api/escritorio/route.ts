import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** O escritório de quem está logado: papel, quem tem acesso e (para o dono) os convites pendentes. */
export const GET = rotaAutenticada(async ({ usuario }) => NextResponse.json(await container().escritorio.resumo(usuario.id)));
