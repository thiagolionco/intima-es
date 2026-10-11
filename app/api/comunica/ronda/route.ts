import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** "Buscar agora": roda a busca automática só para a conta logada. */
export const POST = rotaAutenticada(async ({ usuario }) => NextResponse.json({ termos: await container().rondaComunica.doUsuario(usuario.id) }));
