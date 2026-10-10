import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const POST = rotaAutenticada(async ({ usuario, sessao, ctx }) => NextResponse.json({ encerradas: await container().sessoes.encerrarOutras(usuario.id, sessao.id, ctx) }));
