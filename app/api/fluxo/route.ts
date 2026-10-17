import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Processos do escritório com o estado de cada um na Central de casos. */
export const GET = rotaAutenticada(async ({ usuario }) => NextResponse.json(await container().fluxo.painel(usuario.id)));
