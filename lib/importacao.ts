import { chaveDeduplicacao, type IntimacaoImportada } from "./comunica.ts";
import { aplicarRegra, sugerirRegra } from "./prazos/calculo.ts";
import type { Intimacao, Suspensao } from "./types.ts";

export interface ResultadoMescla {
  /** Acervo com as novas na frente. */
  lista: Intimacao[];
  novas: Intimacao[];
  duplicadas: number;
}

/**
 * Junta ao acervo as comunicações vindas do Comunica, sem duplicar, já com o prazo lido do texto.
 * Usada tanto na busca feita pela tela quanto na ronda automática do servidor.
 */
export function mesclarImportadas(
  acervo: Intimacao[],
  itens: IntimacaoImportada[],
  cliente: string,
  op: { suspensoes: Suspensao[]; agora: string; novoId: () => string },
): ResultadoMescla {
  const vistos = new Set(acervo.map(chaveDeduplicacao));
  const novas: Intimacao[] = [];
  let duplicadas = 0;
  for (const item of itens) {
    const k = chaveDeduplicacao(item);
    if (vistos.has(k)) {
      duplicadas++;
      continue;
    }
    vistos.add(k);
    const regraPrazo = sugerirRegra(item) ?? undefined;
    novas.push(aplicarRegra({ ...item, id: op.novoId(), cliente, status: "nova", regraPrazo, createdAt: op.agora, updatedAt: op.agora }, op.suspensoes));
  }
  return { lista: novas.length ? [...novas, ...acervo] : acervo, novas, duplicadas };
}
