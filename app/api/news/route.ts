import { NextResponse } from "next/server";
import { rotaAutenticada } from "@/server/http/rota";
import { lerNews } from "@/server/news/news";

export const maxDuration = 60;

/** Itens dos feeds oficiais (STF, STJ, Câmara), guardados por um dia. */
export const GET = rotaAutenticada(async () => NextResponse.json(await lerNews(), { headers: { "Cache-Control": "private, no-store" } }));
