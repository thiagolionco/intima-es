import { normalizar } from "./utils.ts";

/** Citações de lei, súmula e precedente achadas num texto (parecer, rascunho). */
export type TipoCitacao = "sumula" | "lei" | "precedente" | "tema";

export const TIPO_CITACAO_LABEL: Record<TipoCitacao, string> = {
  sumula: "Súmula",
  lei: "Lei e artigo",
  precedente: "Precedente",
  tema: "Tema repetitivo ou de repercussão geral",
};

export interface CitacaoEncontrada {
  /** Estável para o mesmo texto citado (normalizado). */
  chave: string;
  tipo: TipoCitacao;
  /** Como está escrita no texto. */
  texto: string;
  /** Quantas vezes aparece. */
  ocorrencias: number;
  /** Marcada com [conferir] logo depois (a IA não achou apoio na biblioteca nem nos PDFs). */
  marcadaConferir: boolean;
}

export type SituacaoCitacao = "confirmada" | "na_biblioteca" | "divergente" | "nao_encontrada" | "nao_verificada";

export const SITUACAO_CITACAO_LABEL: Record<SituacaoCitacao, string> = {
  confirmada: "Confirmada na fonte oficial",
  na_biblioteca: "Está na biblioteca do escritório",
  divergente: "Existe, mas não diz isso ou não vale mais",
  nao_encontrada: "Não encontrada",
  nao_verificada: "Não verificada",
};

export interface CitacaoVerificada extends CitacaoEncontrada {
  situacao: SituacaoCitacao;
  comentario?: string;
  fonte?: { titulo: string; url: string };
  /** Item da biblioteca que tem esta referência. */
  bibliotecaId?: string;
}

export interface VerificacaoCitacoes {
  id: string;
  processoId?: string;
  /** sha256 do texto verificado: se o texto mudar, a verificação fica velha. */
  hashTexto: string;
  citacoes: CitacaoVerificada[];
  /** Se a pesquisa nas fontes oficiais rodou (sem IA, só a biblioteca é conferida). */
  pesquisaOficial: boolean;
  modelo?: string;
  autorNome: string;
  criadoEm: string;
}

export const LIMITES_CITACOES = { texto: 60_000, citacoes: 40 } as const;

const TRIBUNAIS = "STF|STJ|TST|TSE|STM|TNU|TRF\\s?\\d|TJ[A-Z]{2}|TRT\\s?\\d{1,2}|CARF";
const CODIGOS = "CF|CF/88|CC|CC/02|CPC|CPC/15|CDC|CLT|CTN|CP|CPP|ECA|LINDB|LEF|LGPD|Constituição(?: Federal)?|Código Civil|Código de Processo Civil|Código de Defesa do Consumidor";
const ARTIGO = "art(?:igo)?s?\\.?\\s*\\d+[º°o]?(?:-[A-Z])?(?:,?\\s*(?:§|par[aá]grafo)\\s*(?:\\d+[º°o]?|[úu]nico))?(?:,?\\s*(?:inc(?:iso)?\\.?\\s*)?[IVXLC]+\\b)?(?:,?\\s*(?:al[íi]nea\\s*)?[a-z]\\))?";

const PADROES: { tipo: TipoCitacao; re: RegExp }[] = [
  // Súmula 385/STJ, Súmula Vinculante 13, Súmula nº 331 do TST, Enunciado 54 do FONAJE fica de fora.
  { tipo: "sumula", re: new RegExp(`S[úu]mula\\s+(?:Vinculante\\s+)?(?:n[º°o.]*\\s*)?\\d+(?:\\s*(?:\\/|do|da)\\s*(?:${TRIBUNAIS}))?`, "gi") },
  // Tema 1.234/STJ, Tema 69 do STF.
  { tipo: "tema", re: new RegExp(`Tema\\s+(?:n[º°o.]*\\s*)?\\d{1,4}(?:\\.\\d{3})?(?:\\s*(?:\\/|do|da)\\s*(?:${TRIBUNAIS}))?`, "gi") },
  // REsp 1.234.567/SP, AgInt no AREsp 123.456/RJ, RE 574.706, ADI 4.277, RR-1000-11.2019.5.02.0001.
  {
    tipo: "precedente",
    re: /\b(?:(?:AgInt|AgRg|EDcl|EAREsp|EREsp)\s+n[oa]s?\s+)?(?:REsp|AREsp|RE|ARE|RMS|MS|HC|RHC|ADI|ADC|ADPF|ADO|Rcl|CC|IRDR|IAC|RR|AIRR|Ag)\s*(?:n[º°o.]*\s*)?[\d.]{3,}(?:-\d)?(?:\/[A-Z]{2})?\b/g,
  },
  // art. 186 do CC, art. 14, § 3º, do CDC, arts. 927 e 186 do Código Civil.
  { tipo: "lei", re: new RegExp(`${ARTIGO}(?:\\s+e\\s+\\d+[º°o]?)?,?\\s*(?:d[oa]s?\\s+)(?:${CODIGOS})\\b`, "gi") },
  // art. 5º da Lei 8.078/1990, Lei nº 13.709/2018.
  { tipo: "lei", re: new RegExp(`(?:${ARTIGO},?\\s*d[ao]\\s+)?(?:Lei(?:\\s+Complementar)?|Decreto(?:-Lei)?|Medida Provis[óo]ria)\\s+(?:n[º°o.]*\\s*)?[\\d.]+(?:\\/\\d{2,4})?`, "gi") },
];

function chaveDe(texto: string): string {
  return normalizar(texto)
    .replace(/n[º°o.]*\s*(?=\d)/g, "")
    .replace(/\b(do|da|de)\b/g, "/")
    .replace(/[^a-z0-9/§]+/g, "")
    .replace(/\/+/g, "/");
}

/** Acha as citações do texto, sem repetir (a mesma referência escrita de jeitos parecidos conta uma vez). */
export function extrairCitacoes(texto: string): CitacaoEncontrada[] {
  const porChave = new Map<string, CitacaoEncontrada & { inicio: number; fim: number }>();
  const ocupados: [number, number][] = [];
  for (const { tipo, re } of PADROES) {
    re.lastIndex = 0;
    for (const m of texto.matchAll(re)) {
      const inicio = m.index ?? 0;
      const bruto = m[0].trim().replace(/[,.;:]+$/, "");
      const fim = inicio + bruto.length;
      // Uma citação dentro de outra já achada (o número da lei dentro do "art. X da Lei Y") não conta.
      if (ocupados.some(([a, b]) => inicio >= a && fim <= b)) continue;
      ocupados.push([inicio, fim]);
      const chave = `${tipo}:${chaveDe(bruto)}`;
      const depois = texto.slice(fim, fim + 20);
      const marcada = /^\s*\)?\s*\[conferir\]/i.test(depois);
      const atual = porChave.get(chave);
      if (atual) {
        atual.ocorrencias++;
        atual.marcadaConferir ||= marcada;
      } else {
        porChave.set(chave, { chave, tipo, texto: bruto.replace(/\s+/g, " "), ocorrencias: 1, marcadaConferir: marcada, inicio, fim });
      }
    }
  }
  return [...porChave.values()]
    .sort((a, b) => a.inicio - b.inicio)
    .slice(0, LIMITES_CITACOES.citacoes)
    .map(({ inicio: _i, fim: _f, ...c }) => c);
}

/** A referência de um item da biblioteca bate com a citação? Compara sem acento, espaço e "nº". */
export function mesmaReferencia(citacao: string, referencia: string): boolean {
  const a = chaveDe(citacao);
  const b = chaveDe(referencia);
  if (!a || !b) return false;
  // "Súmula 385" bate com "Súmula 385/STJ"; "Súmula 385/STF" não bate com "Súmula 385/STJ".
  return a === b || (!a.includes("/") && b.startsWith(`${a}/`)) || (!b.includes("/") && a.startsWith(`${b}/`));
}

/** Resumo para o selo: quantas pedem atenção. */
export function contarPendencias(v: Pick<VerificacaoCitacoes, "citacoes">): number {
  return v.citacoes.filter((c) => c.situacao === "divergente" || c.situacao === "nao_encontrada" || c.situacao === "nao_verificada").length;
}
