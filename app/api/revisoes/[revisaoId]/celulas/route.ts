import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { revisaoId: string };

/** Edita, confere ou trava uma célula: { processoId, perguntaId, resposta?, revisada?, travada? }. */
export const POST = rotaAutenticada<Params>(async ({ usuario, corpo }, { revisaoId }) => {
  const dados = await corpo<Record<string, unknown>>();
  return NextResponse.json({ celula: await container().revisoes.alterarCelula({ id: usuario.id, nome: usuario.nome }, revisaoId, String(dados.processoId ?? ""), String(dados.perguntaId ?? ""), dados) });
});
