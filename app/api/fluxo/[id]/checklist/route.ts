import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Marca ou desmarca um item do checklist da etapa atual. */
export const POST = rotaAutenticada<{ id: string }>(
  async ({ usuario, corpo }, { id }) => NextResponse.json(await container().fluxo.marcarItem({ id: usuario.id, nome: usuario.nome }, id, await corpo())),
  { limiteCorpo: 1024 },
);
