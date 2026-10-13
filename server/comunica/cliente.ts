import { conferirEco, interpretarResposta, montarParametros } from "../../lib/comunica.ts";
import { type BuscarPagina, ErroComunica } from "./busca.ts";

export interface OpcoesCliente {
  /** URL do endpoint /api/v1/comunicacao. */
  base: string;
  /** Tempo limite de cada chamada, em ms. */
  timeoutMs: number;
  /** Endereço público do Clepsa, informado no User-Agent para o tribunal saber quem consulta. */
  urlApp?: string;
}

/**
 * Busca uma página na API pública do Comunica PJe. A chamada se identifica como Clepsa, sem
 * imitar o site oficial: a API é pública e não exige cabeçalhos de origem.
 */
export function criarBuscadorComunica(op: OpcoesCliente): BuscarPagina {
  const userAgent = `Clepsa/2.0${op.urlApp ? ` (+${op.urlApp})` : ""}`;
  return async (c) => {
    const resp = await fetch(`${op.base}?${montarParametros(c).toString()}`, {
      headers: { Accept: "application/json", "User-Agent": userAgent },
      cache: "no-store",
      signal: AbortSignal.timeout(op.timeoutMs),
    });
    if (resp.status === 429) {
      throw new ErroComunica("O Comunica PJe limitou o número de consultas. Aguarde um minuto e tente novamente.", 429, true);
    }
    if (!resp.ok) {
      const corpo = await resp.text().catch(() => "");
      if (resp.status >= 500) {
        // Ex.: 500 {"message":"O sistema está muito ocupado..."}: a consulta foi pesada demais para o momento.
        throw new ErroComunica(
          "O Comunica PJe está sobrecarregado e recusou a consulta, mesmo repetindo e dividindo o período por dia. Tente de novo em alguns minutos, filtre por tribunal ou use um período menor.",
          503,
          true,
        );
      }
      throw new ErroComunica(`O Comunica PJe respondeu com erro ${resp.status}. ${corpo.slice(0, 200)}`.trim(), 502);
    }
    const r = interpretarResposta(await resp.json());
    // Verificação de eco: o que voltou precisa corresponder ao que foi pedido.
    const recusa = conferirEco(c, r);
    if (recusa) throw new ErroComunica(recusa, 502);
    return r;
  };
}
