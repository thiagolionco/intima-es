import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const GET = rotaAutenticada(async ({ usuario, sessao }) => NextResponse.json({ sessoes: await container().sessoes.listar(usuario.id, sessao.id) }));
