import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Avançar ou atribuir vários casos; cada um é conferido sozinho. */
export const POST = rotaAutenticada(async ({ usuario, corpo }) => NextResponse.json(await container().fluxo.lote({ id: usuario.id, nome: usuario.nome }, await corpo())), { limiteCorpo: 16 * 1024 });
