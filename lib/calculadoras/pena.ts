/**
 * Dosimetria da pena privativa de liberdade pelo critério trifásico (CP, art. 68).
 *
 * As frações da 1ª e da 2ª fase não estão na lei: são as usadas pela jurisprudência do STJ
 * (1/8 do intervalo entre mínimo e máximo, ou 1/6 do mínimo, por circunstância judicial negativa;
 * 1/6 por agravante ou atenuante). A tela deixa o advogado trocar a fração.
 * Frações de dia são desprezadas (CP, art. 11).
 */
import { deDias, duracaoTexto, emDias, fracaoTexto, type Duracao, type Fracao, type Linha } from "./base.ts";
import { prazoArt109 } from "./prescricao.ts";

export const CIRCUNSTANCIAS_JUDICIAIS = [
  "Culpabilidade",
  "Antecedentes",
  "Conduta social",
  "Personalidade do agente",
  "Motivos",
  "Circunstâncias do crime",
  "Consequências do crime",
  "Comportamento da vítima",
];

export const ATENUANTES = [
  { id: "idade", rotulo: "Menor de 21 na data do fato ou maior de 70 na sentença", base: "CP, art. 65, I" },
  { id: "desconhecimento", rotulo: "Desconhecimento da lei", base: "CP, art. 65, II" },
  { id: "relevante-valor", rotulo: "Motivo de relevante valor social ou moral", base: "CP, art. 65, III, a" },
  { id: "reparacao", rotulo: "Procurou evitar ou minorar as consequências, ou reparou o dano antes do julgamento", base: "CP, art. 65, III, b" },
  { id: "coacao", rotulo: "Coação resistível, ordem de autoridade superior ou violenta emoção provocada pela vítima", base: "CP, art. 65, III, c" },
  { id: "confissao", rotulo: "Confissão espontânea", base: "CP, art. 65, III, d; Súmula 545 do STJ" },
  { id: "multidao", rotulo: "Influência de multidão em tumulto que não provocou", base: "CP, art. 65, III, e" },
  { id: "inominada", rotulo: "Circunstância relevante não prevista em lei (inominada)", base: "CP, art. 66" },
];

export const AGRAVANTES = [
  { id: "reincidencia", rotulo: "Reincidência", base: "CP, arts. 61, I, e 63" },
  { id: "motivo", rotulo: "Motivo fútil ou torpe", base: "CP, art. 61, II, a" },
  { id: "facilitar", rotulo: "Para facilitar ou assegurar outro crime", base: "CP, art. 61, II, b" },
  { id: "traicao", rotulo: "Traição, emboscada, dissimulação ou recurso que dificultou a defesa", base: "CP, art. 61, II, c" },
  { id: "meio-cruel", rotulo: "Veneno, fogo, explosivo, tortura ou meio cruel", base: "CP, art. 61, II, d" },
  { id: "familia", rotulo: "Contra ascendente, descendente, irmão ou cônjuge", base: "CP, art. 61, II, e" },
  { id: "abuso", rotulo: "Abuso de autoridade, relações domésticas ou violência contra a mulher", base: "CP, art. 61, II, f" },
  { id: "cargo", rotulo: "Abuso de poder ou violação de dever de cargo, ofício ou profissão", base: "CP, art. 61, II, g" },
  { id: "vulneravel", rotulo: "Contra criança, maior de 60, enfermo ou mulher grávida", base: "CP, art. 61, II, h" },
  { id: "protecao", rotulo: "Ofendido sob proteção da autoridade", base: "CP, art. 61, II, i" },
  { id: "calamidade", rotulo: "Incêndio, naufrágio, calamidade pública ou desgraça do ofendido", base: "CP, art. 61, II, j" },
  { id: "embriaguez", rotulo: "Embriaguez preordenada", base: "CP, art. 61, II, l" },
  { id: "concurso", rotulo: "Agravantes no concurso de pessoas (organiza, coage, instiga, paga)", base: "CP, art. 62" },
];

/** Causas de aumento e de diminuição frequentes, com as frações legais. */
export const CAUSAS_COMUNS: { id: string; rotulo: string; tipo: "aumento" | "diminuicao"; min: Fracao; max: Fracao; base: string }[] = [
  { id: "tentativa", rotulo: "Tentativa", tipo: "diminuicao", min: { num: 1, den: 3 }, max: { num: 2, den: 3 }, base: "CP, art. 14, parágrafo único" },
  { id: "arrependimento", rotulo: "Arrependimento posterior", tipo: "diminuicao", min: { num: 1, den: 3 }, max: { num: 2, den: 3 }, base: "CP, art. 16" },
  { id: "semi-imputavel", rotulo: "Semi-imputabilidade", tipo: "diminuicao", min: { num: 1, den: 3 }, max: { num: 2, den: 3 }, base: "CP, art. 26, parágrafo único" },
  { id: "participacao", rotulo: "Participação de menor importância", tipo: "diminuicao", min: { num: 1, den: 6 }, max: { num: 1, den: 3 }, base: "CP, art. 29, § 1º" },
  { id: "trafico-privilegiado", rotulo: "Tráfico privilegiado", tipo: "diminuicao", min: { num: 1, den: 6 }, max: { num: 2, den: 3 }, base: "Lei 11.343/2006, art. 33, § 4º" },
  { id: "homicidio-privilegiado", rotulo: "Homicídio privilegiado", tipo: "diminuicao", min: { num: 1, den: 6 }, max: { num: 1, den: 3 }, base: "CP, art. 121, § 1º" },
  { id: "furto-noturno", rotulo: "Furto durante o repouso noturno", tipo: "aumento", min: { num: 1, den: 3 }, max: { num: 1, den: 3 }, base: "CP, art. 155, § 1º" },
  { id: "roubo-majorado", rotulo: "Roubo: concurso de pessoas, emprego de arma branca etc.", tipo: "aumento", min: { num: 1, den: 3 }, max: { num: 1, den: 2 }, base: "CP, art. 157, § 2º" },
  { id: "roubo-arma-fogo", rotulo: "Roubo com arma de fogo", tipo: "aumento", min: { num: 2, den: 3 }, max: { num: 2, den: 3 }, base: "CP, art. 157, § 2º-A, I" },
  { id: "trafico-majorado", rotulo: "Tráfico majorado (art. 40)", tipo: "aumento", min: { num: 1, den: 6 }, max: { num: 2, den: 3 }, base: "Lei 11.343/2006, art. 40" },
  { id: "concurso-formal", rotulo: "Concurso formal próprio", tipo: "aumento", min: { num: 1, den: 6 }, max: { num: 1, den: 2 }, base: "CP, art. 70, caput" },
  { id: "continuidade", rotulo: "Crime continuado", tipo: "aumento", min: { num: 1, den: 6 }, max: { num: 2, den: 3 }, base: "CP, art. 71, caput; Súmula 659 do STJ" },
];

export type CriterioBase = "oitavo_intervalo" | "sexto_minimo";

export interface Causa {
  descricao: string;
  tipo: "aumento" | "diminuicao";
  fracao: Fracao;
  base?: string;
}

export interface EntradaDosimetria {
  minimo: Duracao;
  maximo: Duracao;
  desfavoraveis: number;
  criterio: CriterioBase;
  agravantes: number;
  atenuantes: number;
  fracaoSegundaFase: Fracao;
  causas: Causa[];
  tipoPena: "reclusao" | "detencao";
  reincidente: boolean;
  /** Reincidente em crime doloso (afasta a substituição e o sursis). */
  reincidenteDoloso: boolean;
  violenciaOuGraveAmeaca: boolean;
  culposo: boolean;
  maiorDe70: boolean;
  /** Menor de 21 na data do fato ou maior de 70 na sentença: prescrição pela metade (CP, art. 115). */
  reduzPrescricao: boolean;
}

export interface ResultadoDosimetria {
  penaBase: number;
  penaIntermediaria: number;
  penaDefinitiva: number;
  limitadaPelaSumula231: boolean;
  limitadaPeloMaximo: boolean;
  regime: string;
  regimeBase: string;
  substituicao: string;
  sursis: string;
  prescricao: string;
  linhas: Linha[];
  avisos: string[];
}

const ANO = 360;

function vezes(dias: number, f: Fracao) {
  return (dias * f.num) / f.den;
}

export function regimeInicial(penaDias: number, tipo: "reclusao" | "detencao", reincidente: boolean): { regime: string; base: string } {
  if (tipo === "detencao") {
    // Detenção: semiaberto ou aberto, salvo regressão (CP, art. 33, caput).
    if (penaDias > 4 * ANO || reincidente) return { regime: "Semiaberto", base: "CP, art. 33, caput e § 2º" };
    return { regime: "Aberto", base: "CP, art. 33, § 2º, c" };
  }
  if (penaDias > 8 * ANO) return { regime: "Fechado", base: "CP, art. 33, § 2º, a" };
  if (penaDias > 4 * ANO) return reincidente ? { regime: "Fechado", base: "CP, art. 33, § 2º, a e b" } : { regime: "Semiaberto", base: "CP, art. 33, § 2º, b" };
  return reincidente ? { regime: "Semiaberto (ou fechado, se desfavoráveis as circunstâncias judiciais)", base: "CP, art. 33, § 2º, c; Súmula 269 do STJ" } : { regime: "Aberto", base: "CP, art. 33, § 2º, c" };
}

export function calcularDosimetria(e: EntradaDosimetria): ResultadoDosimetria {
  const min = emDias(e.minimo);
  const max = emDias(e.maximo);
  const linhas: Linha[] = [];
  const avisos: string[] = [];

  // 1ª fase
  const n = Math.max(0, Math.min(8, Math.floor(e.desfavoraveis)));
  const passo = e.criterio === "oitavo_intervalo" ? (max - min) / 8 : min / 6;
  const baseBruta = Math.floor(min + n * passo);
  const penaBase = Math.min(max, baseBruta);
  linhas.push({ rotulo: "Pena em abstrato", valor: `${duracaoTexto(e.minimo)} a ${duracaoTexto(e.maximo)}` });
  linhas.push({
    rotulo: "1ª fase: pena-base",
    valor: duracaoTexto(penaBase),
    conta: n ? `mínimo + ${n} × ${e.criterio === "oitavo_intervalo" ? "1/8 do intervalo" : "1/6 do mínimo"} (${duracaoTexto(Math.floor(passo))} cada)` : "nenhuma circunstância judicial negativa: pena no mínimo",
    base: "CP, arts. 59 e 68",
    destaque: true,
  });

  // 2ª fase
  const saldo = Math.floor(e.agravantes) - Math.floor(e.atenuantes);
  const f = e.fracaoSegundaFase;
  let inter = penaBase;
  if (saldo !== 0) inter = Math.floor(penaBase + Math.sign(saldo) * Math.abs(saldo) * vezes(penaBase, f));
  let limitadaPelaSumula231 = false;
  let limitadaPeloMaximo = false;
  if (inter < min) {
    inter = min;
    limitadaPelaSumula231 = true;
  }
  if (inter > max) {
    inter = max;
    limitadaPeloMaximo = true;
  }
  const comp = e.agravantes && e.atenuantes ? ` (${e.agravantes} agravante(s) compensada(s) com ${e.atenuantes} atenuante(s))` : "";
  linhas.push({
    rotulo: "2ª fase: pena intermediária",
    valor: duracaoTexto(inter),
    conta: saldo === 0 ? `sem agravantes ou atenuantes a aplicar${comp}` : `${saldo > 0 ? "+" : "−"} ${Math.abs(saldo)} × ${fracaoTexto(f)} da pena-base${comp}${limitadaPelaSumula231 ? "; parou no mínimo legal" : limitadaPeloMaximo ? "; parou no máximo legal" : ""}`,
    base: limitadaPelaSumula231 ? "CP, arts. 61 a 67; Súmula 231 do STJ" : "CP, arts. 61 a 67",
    destaque: true,
  });
  if (limitadaPelaSumula231) avisos.push("Súmula 231 do STJ: a atenuante não leva a pena abaixo do mínimo legal na 2ª fase. A Terceira Seção do STJ manteve a súmula em 2024, em recursos repetitivos; a tese contrária pode ser sustentada para prequestionamento.");
  if (e.agravantes && e.atenuantes) avisos.push("Compensação: o STJ admite compensar integralmente a confissão com a reincidência (Tema 585); em multirreincidência, a compensação é proporcional. Preponderam motivos, personalidade e reincidência (CP, art. 67).");

  // 3ª fase: causas em cascata, cada uma sobre o resultado da anterior; podem ultrapassar os limites.
  let def = inter;
  for (const c of e.causas) {
    if (!c.fracao.den) continue;
    const antes = def;
    def = c.tipo === "aumento" ? def + vezes(def, c.fracao) : def - vezes(def, c.fracao);
    linhas.push({ rotulo: `${c.tipo === "aumento" ? "Aumento" : "Diminuição"}: ${c.descricao}`, valor: duracaoTexto(Math.floor(def)), conta: `${duracaoTexto(Math.floor(antes))} ${c.tipo === "aumento" ? "+" : "−"} ${fracaoTexto(c.fracao)}`, base: c.base });
  }
  const penaDefinitiva = Math.floor(def);
  linhas.push({ rotulo: "3ª fase: pena definitiva", valor: duracaoTexto(penaDefinitiva), base: "CP, art. 68", destaque: true });
  if (e.causas.filter((c) => c.tipo === "aumento").length > 1) avisos.push("Havendo mais de uma causa de aumento da parte especial, o juiz pode aplicar só a que mais aumente (CP, art. 68, parágrafo único).");

  // Regime, substituição e sursis
  const reg = regimeInicial(penaDefinitiva, e.tipoPena, e.reincidente);
  linhas.push({ rotulo: "Regime inicial (referência legal)", valor: reg.regime, base: reg.base });
  avisos.push("O regime mais grave que o da pena exige fundamentação concreta (Súmulas 718 e 719 do STF; Súmula 440 do STJ). Para tráfico e hediondos, o regime também segue o art. 33 do CP (STF, HC 111.840).");

  let substituicao: string;
  const ate4 = penaDefinitiva <= 4 * ANO;
  if ((ate4 && !e.violenciaOuGraveAmeaca) || e.culposo) {
    if (e.reincidenteDoloso) substituicao = "Em regra não cabe: reincidente em crime doloso (só se socialmente recomendável e não for reincidência específica, art. 44, § 3º)";
    else substituicao = penaDefinitiva <= ANO ? "Cabe: multa ou uma pena restritiva de direitos" : "Cabe: uma restritiva de direitos e multa, ou duas restritivas de direitos";
  } else {
    substituicao = e.violenciaOuGraveAmeaca ? "Não cabe: crime com violência ou grave ameaça à pessoa" : "Não cabe: pena superior a 4 anos";
  }
  linhas.push({ rotulo: "Substituição por restritivas de direitos", valor: substituicao, base: "CP, art. 44, I a III e § 2º" });

  let sursis: string;
  const limiteSursis = e.maiorDe70 ? 4 * ANO : 2 * ANO;
  if (penaDefinitiva > limiteSursis) sursis = `Não cabe: pena superior a ${e.maiorDe70 ? 4 : 2} anos`;
  else if (e.reincidenteDoloso) sursis = "Não cabe: reincidente em crime doloso (salvo condenação anterior só a multa, art. 77, § 1º)";
  else if (substituicao.startsWith("Cabe")) sursis = "Só se não couber a substituição (art. 77, III)";
  else sursis = e.maiorDe70 ? "Cabe o sursis etário: suspensão por 4 a 6 anos" : "Cabe: suspensão por 2 a 4 anos";
  linhas.push({ rotulo: "Suspensão condicional da pena (sursis)", valor: sursis, base: e.maiorDe70 ? "CP, art. 77, § 2º" : "CP, art. 77" });

  const p = prazoArt109(penaDefinitiva);
  const anosPresc = e.reduzPrescricao ? p.anos / 2 : p.anos;
  const prescricao = `${anosPresc.toLocaleString("pt-BR")} anos`;
  linhas.push({ rotulo: "Prescrição pela pena aplicada", valor: prescricao, conta: `${p.faixa}${e.reduzPrescricao ? ", reduzido pela metade" : ""}`, base: `CP, arts. 109, ${p.inciso}, e 110${e.reduzPrescricao ? "; art. 115" : ""}` });

  return {
    penaBase,
    penaIntermediaria: inter,
    penaDefinitiva,
    limitadaPelaSumula231,
    limitadaPeloMaximo,
    regime: reg.regime,
    regimeBase: reg.base,
    substituicao,
    sursis,
    prescricao,
    linhas,
    avisos,
  };
}

export { deDias };
