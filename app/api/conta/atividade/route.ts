import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const GET = rotaAutenticada(async ({ usuario }) => NextResponse.json({ eventos: await container().conta.atividade(usuario.id, 200) }));
