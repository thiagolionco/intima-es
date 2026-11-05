/**
 * Honorários de sucumbência: CPC, art. 85 (inclusive as faixas contra a Fazenda Pública) e
 * CLT, art. 791-A.
 */
import { centavos, pct, reais, type Linha } from "./base.ts";

/** Faixas do art. 85, § 3º, em salários mínimos (limite superior de cada faixa). */
export const FAIXAS_FAZENDA = [
  { ate: 200, min: 10, max: 20, inciso: "I" },
  { ate: 2000, min: 8, max: 10, inciso: "II" },
  { ate: 20000, min: 5, max: 8, inciso: "III" },
  { ate: 100000, min: 3, max: 5, inciso: "IV" },
  { ate: Infinity, min: 1, max: 3, inciso: "V" },
];

export interface ResultadoHonorarios {
  minimo: number;
  maximo: number;
  escolhido: number;
  linhas: Linha[];
  avisos: string[];
}

/** Posição entre o mínimo e o máximo de cada faixa: 0 = mínimo, 1 = máximo. */
export function honorariosFazenda(base: number, salarioMinimo: number, posicao: number): ResultadoHonorarios {
  const t = Math.max(0, Math.min(1, posicao));
  let resto = base;
  let anterior = 0;
  let minimo = 0;
  let maximo = 0;
  let escolhido = 0;
  const linhas: Linha[] = [];
  for (const f of FAIXAS_FAZENDA) {
    if (resto <= 0) break;
    const limite = f.ate * salarioMinimo;
    const fatia = Math.min(resto, limite - anterior);
    const perc = f.min + (f.max - f.min) * t;
    minimo += (fatia * f.min) / 100;
    maximo += (fatia * f.max) / 100;
    escolhido += (fatia * perc) / 100;
    linhas.push({
      rotulo: `Faixa ${f.inciso}: ${f.ate === Infinity ? `acima de ${anterior / salarioMinimo} SM` : `até ${f.ate.toLocaleString("pt-BR")} SM`}`,
      valor: reais((fatia * perc) / 100),
      conta: `${reais(fatia)} × ${pct(perc, 2)} (faixa de ${f.min}% a ${f.max}%)`,
      base: `CPC, art. 85, § 3º, ${f.inciso}`,
    });
    resto -= fatia;
    anterior = limite;
  }
  escolhido = centavos(escolhido);
  linhas.push({ rotulo: "Honorários", valor: reais(escolhido), conta: `faixas aplicadas em sequência (de ${reais(minimo)} a ${reais(maximo)})`, base: "CPC, art. 85, § 5º", destaque: true });
  return {
    minimo: centavos(minimo),
    maximo: centavos(maximo),
    escolhido,
    linhas,
    avisos: [
      "O salário mínimo é o vigente na data da sentença líquida ou da liquidação (CPC, art. 85, § 4º, IV).",
      "Sem condenação, a base é o proveito econômico ou, se não for mensurável, o valor atualizado da causa (§ 4º, III).",
    ],
  };
}

export type RegimeHonorarios = "cpc" | "fazenda" | "trabalhista";

/** Percentual simples dentro dos limites da lei (CPC 10% a 20%; CLT 5% a 15%). */
export function honorariosPercentual(base: number, percentual: number, regime: "cpc" | "trabalhista"): ResultadoHonorarios {
  const [min, max] = regime === "cpc" ? [10, 20] : [5, 15];
  const avisos: string[] = [];
  if (percentual < min || percentual > max) avisos.push(`O percentual fica entre ${min}% e ${max}% (${regime === "cpc" ? "CPC, art. 85, § 2º" : "CLT, art. 791-A"}).`);
  const p = Math.max(min, Math.min(max, percentual));
  const escolhido = centavos((base * p) / 100);
  if (regime === "cpc") {
    avisos.push("Equidade (§ 8º) só quando o proveito for inestimável ou irrisório, ou o valor da causa muito baixo; não cabe para valores elevados (STJ, Tema 1.076).");
    avisos.push("No recurso, o tribunal majora os honorários sem passar de 20% (§ 11; STJ, Tema 1.059).");
  } else {
    avisos.push("Na sucumbência recíproca, cada parte paga honorários sobre o que perdeu, vedada a compensação (CLT, art. 791-A, § 3º). Para o beneficiário da justiça gratuita, a cobrança fica suspensa (STF, ADI 5.766).");
  }
  return {
    minimo: centavos((base * min) / 100),
    maximo: centavos((base * max) / 100),
    escolhido,
    linhas: [
      { rotulo: "Base de cálculo", valor: reais(base), conta: "condenação, proveito econômico ou valor da causa" },
      { rotulo: "Faixa legal", valor: `${reais((base * min) / 100)} a ${reais((base * max) / 100)}`, conta: `${min}% a ${max}%`, base: regime === "cpc" ? "CPC, art. 85, § 2º" : "CLT, art. 791-A, caput" },
      { rotulo: "Honorários", valor: reais(escolhido), conta: `${reais(base)} × ${pct(p, 2)}`, destaque: true },
    ],
    avisos,
  };
}
