import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { id: string };

/** Última consulta do processo no DataJud (null se nunca foi consultado) e se dá para consultar agora. */
export const GET = rotaAutenticada<Params>(async ({ usuario }, { id }) => {
  const c = container();
  return NextResponse.json({ ...(await c.movimentacoes.situacao(usuario.id, id)), disponivel: c.movimentacoes.disponivel });
});

/** Consulta o DataJud agora. */
export const POST = rotaAutenticada<Params>(async ({ usuario }, { id }) => NextResponse.json(await container().movimentacoes.atualizar(usuario.id, id)));
