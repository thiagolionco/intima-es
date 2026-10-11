import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const dynamic = "force-dynamic";

/** O que está ligado neste servidor, para a tela mostrar só o que funciona. */
export const GET = rotaAutenticada(async () => NextResponse.json({ resumos: container().resumos.disponivel }));
