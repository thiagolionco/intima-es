import { NextResponse, type NextRequest } from "next/server";
import { validarConsulta, type ConsultaComunica } from "@/lib/comunica";
import type { TipoTermo } from "@/lib/types";
import { NOME_COOKIE_SESSAO } from "@/lib/auth/cookie";
import { buscarEmJanelas, ErroComunica } from "@/server/comunica/busca";
import { criarBuscadorComunica } from "@/server/comunica/cliente";
import { container } from "@/server/container";

export const dynamic = "force-dynamic";
export const maxDuration = 150;

/** Máximo de comunicações devolvidas por busca. */
const MAX_ITENS = 500;
/** Tempo limite de cada chamada ao Comunica. Buscas por nome de grandes litigantes são lentas. */
const TIMEOUT_MS = 40_000;
/** Tempo total da busca; depois disso devolvemos o que já foi encontrado. */
const ORCAMENTO_MS = 100_000;
/** O período é consultado em janelas curtas, que o Comunica responde bem mais rápido. */
const DIAS_POR_JANELA = 7;
const TIPOS: TipoTermo[] = ["parte", "advogado", "oab", "processo"];

/**
 * Proxy para a API pública do Comunica PJe. A chamada é feita no servidor para evitar
 * bloqueios de CORS no navegador e para paginar os resultados de uma vez (ver buscarEmJanelas).
 */
export async function GET(req: NextRequest) {
  if (!(await container().sessoes.validar(req.cookies.get(NOME_COOKIE_SESSAO)?.value))) {
    return NextResponse.json({ erro: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  }
  const q = req.nextUrl.searchParams;
  const tipo = q.get("tipo") as TipoTermo;
  if (!TIPOS.includes(tipo)) {
    return NextResponse.json({ erro: "Tipo de pesquisa inválido." }, { status: 400 });
  }
  const consulta: ConsultaComunica = {
    termo: {
      tipo,
      valor: q.get("valor") ?? "",
      ufOab: q.get("ufOab") || undefined,
      tribunal: q.get("tribunal") || undefined,
    },
    dataInicio: q.get("dataInicio") ?? "",
    dataFim: q.get("dataFim") ?? "",
  };
  const invalido = validarConsulta(consulta);
  if (invalido) return NextResponse.json({ erro: invalido }, { status: 400 });

  const buscarPagina = criarBuscadorComunica({
    base: container().config.comunica.url,
    timeoutMs: TIMEOUT_MS,
    urlApp: container().config.urlApp,
  });

  try {
    const r = await buscarEmJanelas(consulta, buscarPagina, { diasPorJanela: DIAS_POR_JANELA, maxItens: MAX_ITENS, orcamentoMs: ORCAMENTO_MS });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErroComunica) return NextResponse.json({ erro: e.message }, { status: e.status });
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return NextResponse.json(
      {
        erro: timeout
          ? "O Comunica PJe não respondeu a tempo, mesmo consultando dia a dia. Ele pode estar instável agora: tente novamente em alguns minutos ou filtre por tribunal."
          : "Não foi possível conectar ao Comunica PJe. Verifique sua conexão com a internet.",
        detalhe: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }
}
