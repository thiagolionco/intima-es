import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Muda a etapa: o servidor confere os portões de novo e recusa (422) o que não passar. */
export const POST = rotaAutenticada<{ id: string }>(
  async ({ usuario, corpo }, { id }) => NextResponse.json(await container().fluxo.transicionar({ id: usuario.id, nome: usuario.nome }, id, await corpo())),
  { limiteCorpo: 4 * 1024 },
);
