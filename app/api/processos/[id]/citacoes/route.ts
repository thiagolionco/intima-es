import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { id: string };

/** Última verificação de citações do processo e se a pesquisa nas fontes oficiais está ligada. */
export const GET = rotaAutenticada<Params>(async ({ usuario }, { id }) => {
  const c = container();
  return NextResponse.json({ verificacao: await c.citacoes.ultima(usuario.id, id), pesquisaDisponivel: c.citacoes.pesquisaDisponivel });
});
