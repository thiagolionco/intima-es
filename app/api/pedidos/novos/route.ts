import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Quantos pedidos novos esperam alguém (para o número no menu). */
export const GET = rotaAutenticada(async ({ usuario }) => NextResponse.json({ novos: (await container().pedidos.listar(usuario.id)).filter((p) => p.status === "novo").length }));
