import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Espaço de trabalho do usuário logado: intimações e clientes monitorados. */
export const GET = rotaAutenticada(async ({ usuario }) => NextResponse.json(await container().espacos.carregar(usuario.id)));

export const PUT = rotaAutenticada(
  async ({ usuario, corpo }) => {
    const salvo = await container().espacos.salvar(usuario.id, await corpo());
    return NextResponse.json({ revisao: salvo.revisao, atualizadoEm: salvo.atualizadoEm });
  },
  { limiteCorpo: 20 * 1024 * 1024 },
);
