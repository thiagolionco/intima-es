import { calendarioDa } from "./prazos/calculo.ts";
import type { Calendario } from "./prazos/calendario.ts";
import { somarDias } from "./prazos/datas.ts";
import type { Intimacao, PreferenciasAvisos, Suspensao } from "./types.ts";

export interface AvisoDevido {
  intimacao: Intimacao;
  /** Dias úteis entre hoje e o vencimento (0 = vence hoje). */
  diasUteis: number;
  /** Chaves a registrar como enviadas: a regra que disparou e as anteriores que ficaram para trás. */
  chaves: string[];
}

/** Identifica um aviso: muda se o prazo mudar, para o aviso sair de novo. */
export function chaveAviso(i: Pick<Intimacao, "id" | "prazo">, diasAntes: number): string {
  return `${i.id}|${i.prazo}|${diasAntes}`;
}

/** N-ésimo dia útil antes de `data` (0 devolve a própria data). */
export function diaUtilAntes(data: string, n: number, cal: Calendario): string {
  let d = data;
  for (let contados = 0; contados < n; ) {
    d = somarDias(d, -1);
    if (cal.ehUtil(d)) contados++;
  }
  return d;
}

/** Dias úteis depois de `hoje` até `prazo`, inclusive. 0 quando vence hoje. */
export function diasUteisAte(hoje: string, prazo: string, cal: Calendario): number {
  let n = 0;
  for (let d = somarDias(hoje, 1); d <= prazo; d = somarDias(d, 1)) if (cal.ehUtil(d)) n++;
  return n;
}

const emAberto = (i: Intimacao) => (i.status === "nova" || i.status === "em_analise") && !!i.prazo;

/**
 * Intimações que devem entrar no aviso de hoje. Para cada uma vale a regra mais próxima do
 * vencimento que já chegou (se o servidor ficou parado, não manda três avisos atrasados de uma vez).
 */
export function avisosDevidos(intimacoes: Intimacao[], prefs: PreferenciasAvisos, hoje: string, suspensoes: Suspensao[], enviados: Set<string>): AvisoDevido[] {
  const regras = [...new Set(prefs.diasAntes.filter((n) => Number.isInteger(n) && n >= 0 && n <= 30))].sort((a, b) => b - a);
  const devidos: AvisoDevido[] = [];
  for (const i of intimacoes) {
    if (!emAberto(i) || i.prazo! < hoje) continue;
    const cal = calendarioDa(i, suspensoes);
    const chegaram = regras.filter((n) => diaUtilAntes(i.prazo!, n, cal) <= hoje);
    if (!chegaram.length) continue;
    const ultima = chegaram[chegaram.length - 1];
    if (enviados.has(chaveAviso(i, ultima))) continue;
    devidos.push({ intimacao: i, diasUteis: diasUteisAte(hoje, i.prazo!, cal), chaves: chegaram.map((n) => chaveAviso(i, n)) });
  }
  return devidos.sort((a, b) => a.intimacao.prazo!.localeCompare(b.intimacao.prazo!));
}

export function rotuloVencimento(diasUteis: number): string {
  if (diasUteis === 0) return "vence hoje";
  if (diasUteis === 1) return "vence no próximo dia útil";
  return `vence em ${diasUteis} dias úteis`;
}
