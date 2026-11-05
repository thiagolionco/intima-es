/**
 * Custas da Justiça Federal (Lei 9.289/1996) e da Justiça do Trabalho (CLT, art. 789).
 * As custas estaduais seguem a lei de cada estado: a tela leva à tabela do tribunal.
 */
import { centavos, reais, type Linha } from "./base.ts";
import { UFIR } from "./parametros.ts";
import { custasTrabalhistas } from "./trabalhista.ts";

/** Tabela I, a, da Lei 9.289/1996: ações cíveis em geral, 1% do valor da causa, de 10 a 1.800 UFIR. */
export function custasJusticaFederal(valorCausa: number): { total: number; inicial: number; linhas: Linha[]; avisos: string[] } {
  const minimo = centavos(10 * UFIR);
  const maximo = centavos(1800 * UFIR);
  const bruto = centavos(valorCausa * 0.01);
  const total = Math.min(maximo, Math.max(minimo, bruto));
  const inicial = centavos(total / 2);
  return {
    total,
    inicial,
    linhas: [
      { rotulo: "Custas (1% do valor da causa)", valor: reais(total), conta: bruto < minimo ? `${reais(bruto)}, abaixo do mínimo de 10 UFIR` : bruto > maximo ? `${reais(bruto)}, limitado a 1.800 UFIR` : `${reais(valorCausa)} × 1%`, base: "Lei 9.289/1996, Tabela I, a" },
      { rotulo: "Metade paga na distribuição", valor: reais(inicial), base: "Lei 9.289/1996, art. 14, I", destaque: true },
      { rotulo: "Restante (ao recorrer ou ao fim)", valor: reais(centavos(total - inicial)), base: "Lei 9.289/1996, art. 14, II e III" },
    ],
    avisos: [`UFIR de R$ 1,0641: mínimo ${reais(minimo)} e máximo ${reais(maximo)}.`, "Isentos: União, Estados, Municípios, autarquias e fundações, beneficiários da justiça gratuita e outros do art. 4º."],
  };
}

export function custasJusticaDoTrabalho(base: number, ano: number) {
  const c = custasTrabalhistas(base, ano);
  return {
    total: c.valor,
    linhas: [{ rotulo: "Custas (2%)", valor: reais(c.valor), conta: c.conta, base: "CLT, art. 789, caput e I a IV", destaque: true }] as Linha[],
    avisos: [
      `Mínimo de ${reais(c.minimo)} e máximo de 4 vezes o teto do RGPS (${reais(c.maximo)}).`,
      "Base: valor do acordo ou da condenação; na improcedência, extinção ou arquivamento, o valor da causa. Pagas pelo vencido depois do trânsito em julgado, ou no prazo do recurso (art. 789, § 1º).",
    ],
  };
}
