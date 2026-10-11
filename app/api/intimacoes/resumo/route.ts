import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { AppError } from "@/server/core/errors";
import { rotaAutenticada } from "@/server/http/rota";
import { MAXIMO_POR_PEDIDO } from "@/server/resumos/resumos";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Resume as intimações pedidas que ainda não têm resumo. Sem `ids`, as mais recentes. */
export const POST = rotaAutenticada(async ({ usuario, corpo }) => {
  // Cada resumo é uma chamada paga à API: limita por conta.
  container().limitador.consumir(`resumos:${usuario.id}`, 30, 60 * 60_000);
  const { ids } = await corpo<{ ids?: unknown }>();
  if (ids !== undefined && (!Array.isArray(ids) || ids.length > MAXIMO_POR_PEDIDO || ids.some((x) => typeof x !== "string")))
    throw new AppError("dados_invalidos", `Envie até ${MAXIMO_POR_PEDIDO} intimações por vez.`);
  return NextResponse.json(await container().resumos.resumir(usuario.id, ids as string[] | undefined));
});
