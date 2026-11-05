/**
 * Atualização por fator, juros simples pro rata die e cumprimento de sentença (CPC, art. 523).
 *
 * O fator de correção vem da tabela do tribunal ou da Calculadora do Cidadão do Banco Central;
 * aqui não se baixam índices.
 */
import { centavos, dataBR, diasEntre, numeroBR, pct, reais, type Linha } from "./base.ts";

export interface EntradaAtualizacao {
  principal: number;
  /** Fator acumulado de correção (1 = sem correção). */
  fator: number;
  /** Juros simples, % ao mês. */
  jurosMes: number;
  /** Período dos juros (citação ou evento danoso até a data do cálculo). */
  jurosDe?: string;
  jurosAte?: string;
  /** Juros sobre o valor corrigido (padrão) ou sobre o original. */
  jurosSobreCorrigido: boolean;
}

export interface ResultadoAtualizacao {
  corrigido: number;
  juros: number;
  total: number;
  meses: number;
  linhas: Linha[];
  avisos: string[];
}

export function atualizar(e: EntradaAtualizacao): ResultadoAtualizacao {
  const corrigido = centavos(e.principal * e.fator);
  let juros = 0;
  let meses = 0;
  const linhas: Linha[] = [{ rotulo: "Valor original", valor: reais(e.principal) }];
  if (e.fator !== 1) linhas.push({ rotulo: "Valor corrigido", valor: reais(corrigido), conta: `${reais(e.principal)} × fator ${numeroBR(e.fator, 7)}`, base: "CC, art. 389, parágrafo único (IPCA, desde 30/08/2024)" });
  if (e.jurosMes > 0 && e.jurosDe && e.jurosAte && e.jurosAte > e.jurosDe) {
    const dias = diasEntre(e.jurosDe, e.jurosAte);
    meses = dias / 30;
    const base = e.jurosSobreCorrigido ? corrigido : e.principal;
    juros = centavos((base * e.jurosMes * meses) / 100);
    linhas.push({
      rotulo: "Juros de mora (simples)",
      valor: reais(juros),
      conta: `${reais(base)} × ${pct(e.jurosMes)} ao mês × ${numeroBR(meses, 4)} meses (${dias} dias de ${dataBR(e.jurosDe)} a ${dataBR(e.jurosAte)}, ÷ 30)`,
      base: "CC, arts. 405 e 406",
    });
  }
  const total = centavos(corrigido + juros);
  linhas.push({ rotulo: "Total atualizado", valor: reais(total), destaque: true });
  return {
    corrigido,
    juros,
    total,
    meses,
    linhas,
    avisos: [
      "Desde 30/08/2024 (Lei 14.905/2024), sem taxa contratada: correção pelo IPCA (CC, art. 389, parágrafo único) e juros pela taxa legal, Selic menos IPCA, que não pode ser negativa (art. 406, §§ 1º e 3º). Antes disso, a jurisprudência usava 1% ao mês (art. 406 antigo c/c CTN, art. 161, § 1º).",
      "Período anterior e posterior a 30/08/2024: faça um cálculo para cada período. Contra a Fazenda Pública, desde 09/12/2021 incide só a Selic, uma única vez (EC 113/2021, art. 3º). Na Justiça do Trabalho, siga a ADC 58 do STF e a decisão do TST de 2024 sobre a Lei 14.905.",
      "Termo inicial dos juros: citação na responsabilidade contratual (CC, art. 405); evento danoso na extracontratual (Súmula 54 do STJ); vencimento na obrigação líquida e com termo (CC, art. 397).",
    ],
  };
}

export interface ResultadoCumprimento {
  multa: number;
  honorarios: number;
  total: number;
  linhas: Linha[];
  avisos: string[];
}

/**
 * Sem pagamento voluntário em 15 dias (úteis), o débito é acrescido de multa de 10% e de
 * honorários de 10% (CPC, art. 523, § 1º). Pagamento parcial: multa e honorários só sobre o
 * restante (§ 2º).
 */
export function cumprimentoDeSentenca(debito: number, pagoNoPrazo = 0): ResultadoCumprimento {
  const restante = centavos(Math.max(0, debito - pagoNoPrazo));
  const multa = centavos(restante * 0.1);
  const honorarios = centavos(restante * 0.1);
  const total = centavos(restante + multa + honorarios);
  const linhas: Linha[] = [{ rotulo: "Débito atualizado", valor: reais(debito) }];
  if (pagoNoPrazo > 0) linhas.push({ rotulo: "Pago no prazo", valor: `− ${reais(pagoNoPrazo)}`, base: "CPC, art. 523, § 2º" }, { rotulo: "Restante", valor: reais(restante) });
  linhas.push(
    { rotulo: "Multa de 10%", valor: reais(multa), conta: `${reais(restante)} × 10%`, base: "CPC, art. 523, § 1º" },
    { rotulo: "Honorários de 10%", valor: reais(honorarios), conta: `${reais(restante)} × 10%`, base: "CPC, art. 523, § 1º" },
    { rotulo: "Total a executar", valor: reais(total), destaque: true },
  );
  return {
    multa,
    honorarios,
    total,
    linhas,
    avisos: [
      "O prazo de 15 dias para pagar é contado em dias úteis (STJ, REsp 1.708.348/RJ) a partir da intimação do devedor.",
      "Contra a Fazenda Pública não incide a multa do art. 523 (CPC, art. 534, § 2º); os honorários seguem o art. 85, § 7º.",
    ],
  };
}
