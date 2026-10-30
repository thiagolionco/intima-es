import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { id: string };

/** Cola um e-mail ou anotação no processo: { tipo, titulo?, texto, data?, resumir?, visivelAoCliente? }. */
export const POST = rotaAutenticada<Params>(
  async ({ usuario, corpo }, { id }) => NextResponse.json({ nota: await container().linhaDoTempo.criarNota({ id: usuario.id, nome: usuario.nome }, id, await corpo()) }, { status: 201 }),
  { limiteCorpo: 128 * 1024 },
);
