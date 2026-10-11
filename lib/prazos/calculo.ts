import type { ContagemPrazo, Intimacao, RegraPrazo, Suspensao } from "../types.ts";
import { Calendario } from "./calendario.ts";
import { dataValida, somarDias } from "./datas.ts";

export interface DiaPulado {
  data: string;
  motivo: string;
}

export interface ResultadoPrazo {
  /** Data da publicação: primeiro dia útil após a disponibilização (Lei 11.419/2006, art. 4º, § 3º). */
  publicacao: string;
  /** Primeiro dia da contagem: primeiro dia útil após a publicação (art. 4º, § 4º, e art. 224 do CPC). */
  inicio: string;
  /** Último dia do prazo. */
  fim: string;
  /** Dias efetivamente contados (o dobro, quando for o caso). */
  dias: number;
  contagem: ContagemPrazo;
  /** Dias entre o início e o vencimento que não entraram na contagem, exceto fins de semana. */
  pulados: DiaPulado[];
  /** Fins de semana entre o início e o vencimento que não entraram na contagem. */
  finsDeSemana: number;
  /** Em dias corridos, quando o último dia caiu sem expediente e o vencimento passou para o dia útil seguinte. */
  prorrogadoDe?: string;
}

export const DIAS_MAXIMOS = 365;

/**
 * Calcula o vencimento de um prazo processual a partir da data de disponibilização no DJEN.
 *
 * - Dias úteis (CPC, art. 219; CLT, art. 775): conta só dias com expediente.
 * - Dias corridos (CPP, art. 798): conta todos os dias, menos os de suspensão (recesso,
 *   portarias); se o último cair sem expediente, vence no dia útil seguinte.
 */
export function calcularPrazo(disponibilizacao: string, regra: Pick<RegraPrazo, "dias" | "contagem" | "dobro">, calendario: Calendario): ResultadoPrazo | null {
  if (!dataValida(disponibilizacao)) return null;
  const base = Math.floor(regra.dias);
  if (!(base >= 1 && base <= DIAS_MAXIMOS)) return null;
  const dias = regra.dobro ? base * 2 : base;

  const publicacao = calendario.proximoUtil(disponibilizacao);
  const inicio = calendario.proximoUtil(publicacao);
  const pulados: DiaPulado[] = [];
  let finsDeSemana = 0;
  const pular = (d: string, motivo: string) => {
    if (motivo === "sábado" || motivo === "domingo") finsDeSemana++;
    else pulados.push({ data: d, motivo });
  };

  let d = inicio;
  let contados = 0;
  for (let guarda = 0; guarda < 5000; guarda++) {
    const motivo = regra.contagem === "uteis" ? calendario.motivo(d) : calendario.suspensao(d);
    if (motivo) pular(d, motivo);
    else if (++contados === dias) break;
    d = somarDias(d, 1);
  }

  let prorrogadoDe: string | undefined;
  if (regra.contagem === "corridos" && !calendario.ehUtil(d)) {
    prorrogadoDe = d;
    const fim = calendario.proximoUtil(d);
    for (let x = somarDias(d, 1); x < fim; x = somarDias(x, 1)) pular(x, calendario.motivo(x)!);
    d = fim;
  }
  return { publicacao, inicio, fim: d, dias, contagem: regra.contagem, pulados, finsDeSemana, prorrogadoDe };
}

/** Calendário da intimação, já com as suspensões do escritório que valem para o tribunal dela. */
export function calendarioDa(i: Pick<Intimacao, "tribunal">, suspensoes: Suspensao[]): Calendario {
  return new Calendario(i.tribunal, suspensoes);
}

/** Recalcula `prazo` de uma intimação que tem regra; as que têm data manual ficam como estão. */
export function aplicarRegra<T extends Pick<Intimacao, "tribunal" | "dataDisponibilizacao" | "regraPrazo" | "prazo">>(i: T, suspensoes: Suspensao[]): T {
  if (!i.regraPrazo) return i;
  const r = calcularPrazo(i.dataDisponibilizacao, i.regraPrazo, calendarioDa(i, suspensoes));
  if (!r || r.fim === i.prazo) return i;
  return { ...i, prazo: r.fim };
}

// ---------- Leitura do prazo no texto ----------

const NUMEROS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
  dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, quarenta_e_cinco: 45, sessenta: 60, noventa: 90,
};

const NUM = `(\\d{1,3}|${Object.keys(NUMEROS).map((k) => k.replace(/_/g, " ")).join("|")})`;

/** "prazo de 15 (quinze) dias úteis", "no prazo comum de cinco dias", "em 10 dias", "prazo: 5 dias". */
const PADROES = [
  new RegExp(`prazo(?:\\s+(?:comum|sucessivo|improrrogavel))?\\s*(?:de|:)\\s*${NUM}\\s*(?:\\([^)]{0,40}\\)\\s*)?dias?(\\s+(?:uteis|corridos))?`),
  new RegExp(`\\b(?:em|dentro\\s+de|no\\s+prazo\\s+de)\\s+${NUM}\\s*(?:\\([^)]{0,40}\\)\\s*)?dias?(\\s+(?:uteis|corridos))?`),
];

function normalizar(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

export interface PrazoNoTexto {
  dias: number;
  contagem?: ContagemPrazo;
  trecho: string;
}

/** Procura no inteiro teor o número de dias do prazo. Devolve null quando não há um número claro ("prazo legal"). */
export function lerPrazoDoTexto(texto: string): PrazoNoTexto | null {
  const t = normalizar(texto);
  let melhor: { indice: number; m: RegExpExecArray } | null = null;
  for (const re of PADROES) {
    const m = re.exec(t);
    if (m && (!melhor || m.index < melhor.indice)) melhor = { indice: m.index, m };
  }
  if (!melhor) return null;
  const bruto = melhor.m[1];
  const dias = /^\d+$/.test(bruto) ? Number(bruto) : NUMEROS[bruto.replace(/ /g, "_")];
  if (!dias || dias > DIAS_MAXIMOS) return null;
  const sufixo = (melhor.m[2] ?? "").trim();
  return {
    dias,
    contagem: sufixo === "uteis" ? "uteis" : sufixo === "corridos" ? "corridos" : undefined,
    trecho: melhor.m[0].trim(),
  };
}

/** Matéria penal conta em dias corridos (CPP, art. 798); o resto, em dias úteis. */
export function contagemPadrao(i: Pick<Intimacao, "classe" | "orgao">): ContagemPrazo {
  const t = normalizar(`${i.classe} ${i.orgao}`);
  return /\b(penal|criminal|crime|habeas corpus|inquerito|execucao da pena|juri)\b/.test(t) ? "corridos" : "uteis";
}

/** Regra sugerida para uma intimação nova, lida do texto. Null quando o texto não traz o número de dias. */
export function sugerirRegra(i: Pick<Intimacao, "texto" | "classe" | "orgao">): RegraPrazo | null {
  const lido = lerPrazoDoTexto(i.texto);
  if (!lido) return null;
  return { dias: lido.dias, contagem: lido.contagem ?? contagemPadrao(i), dobro: false, fonte: "texto", trecho: lido.trecho };
}
