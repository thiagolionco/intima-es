import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { id: string };

/** Versões do parecer, da mais nova para a mais antiga. */
export const GET = rotaAutenticada<Params>(async ({ usuario }, { id }) => NextResponse.json({ pareceres: await container().pareceres.listar(usuario.id, id) }));

/** Nova versão: { texto, baseVersao }. O autor vem da sessão. */
export const POST = rotaAutenticada<Params>(
  async ({ usuario, corpo }, { id }) => NextResponse.json({ parecer: await container().pareceres.salvar({ id: usuario.id, nome: usuario.nome }, id, await corpo()) }, { status: 201 }),
  // 50 mil caracteres podem passar de 64 KB em UTF-8 (acentos ocupam 2 bytes).
  { limiteCorpo: 256 * 1024 },
);
