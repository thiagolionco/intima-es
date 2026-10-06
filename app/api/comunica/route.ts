import { NextResponse, type NextRequest } from "next/server";
import {
  COMUNICA_API_URL,
  COMUNICA_ITENS_POR_PAGINA,
  interpretarResposta,
  montarParametros,
  validarConsulta,
  type ConsultaComunica,
  type IntimacaoImportada,
} from "@/lib/comunica";
import type { TipoTermo } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_PAGINAS = 5;
const TIMEOUT_MS = 20_000;
const TIPOS: TipoTermo[] = ["parte", "advogado", "oab", "processo"];

/**
 * Proxy para a API pública do Comunica PJe. A chamada é feita no servidor para evitar
 * bloqueios de CORS no navegador e para paginar os resultados de uma vez.
 */
export async function GET(req: NextRequest) {
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

  const base = process.env.COMUNICA_API_URL || COMUNICA_API_URL;
  const itens: IntimacaoImportada[] = [];
  let total = 0;

  try {
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const url = `${base}?${montarParametros({ ...consulta, pagina }).toString()}`;
      const resp = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "ControleIntimacoes/1.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (resp.status === 429) {
        return NextResponse.json(
          { erro: "O Comunica PJe limitou o número de consultas. Aguarde um minuto e tente novamente.", itens, total },
          { status: 429 },
        );
      }
      if (!resp.ok) {
        const corpo = await resp.text().catch(() => "");
        return NextResponse.json(
          { erro: `O Comunica PJe respondeu com erro ${resp.status}.`, detalhe: corpo.slice(0, 300) },
          { status: 502 },
        );
      }

      const { total: t, itens: pagItens } = interpretarResposta(await resp.json());
      total = t;
      itens.push(...pagItens);
      if (pagItens.length < COMUNICA_ITENS_POR_PAGINA || itens.length >= total) break;
    }
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return NextResponse.json(
      {
        erro: timeout
          ? "O Comunica PJe demorou demais para responder. Tente um período menor."
          : "Não foi possível conectar ao Comunica PJe. Verifique sua conexão com a internet.",
        detalhe: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ total, itens, truncado: itens.length < total });
}
