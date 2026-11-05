/**
 * Verbas rescisórias e valor da causa trabalhista.
 *
 * Desde a Lei 13.467/2017 o pedido na reclamação trabalhista deve ser "certo, determinado e com
 * indicação de seu valor" (CLT, art. 840, § 1º), e o valor da causa é a soma dos pedidos
 * (CPC, art. 292, VI, aplicado pela CLT, art. 769, e pela IN 41/2018 do TST, art. 12, § 2º, que
 * admite valor estimado). Este módulo faz as contas; quem decide o que pedir é o advogado.
 */
import { anosCompletos, centavos, dataBR, mesesEDias, reais, somarAnos, somarDias, type Linha } from "./base.ts";
import { salarioMinimo, tetoRgps } from "./parametros.ts";

export type Modalidade = "sem_justa_causa" | "rescisao_indireta" | "pedido_demissao" | "justa_causa" | "acordo";

export const MODALIDADES: { id: Modalidade; rotulo: string; base: string }[] = [
  { id: "sem_justa_causa", rotulo: "Dispensa sem justa causa", base: "CLT, art. 477" },
  { id: "rescisao_indireta", rotulo: "Rescisão indireta", base: "CLT, art. 483" },
  { id: "pedido_demissao", rotulo: "Pedido de demissão", base: "CLT, art. 477" },
  { id: "justa_causa", rotulo: "Dispensa por justa causa", base: "CLT, art. 482" },
  { id: "acordo", rotulo: "Acordo entre as partes", base: "CLT, art. 484-A" },
];

export type TipoAviso = "indenizado" | "trabalhado";

export interface EntradaRescisao {
  admissao: string;
  /** Último dia trabalhado (no aviso trabalhado, o último dia do aviso). */
  saida: string;
  /** Remuneração mensal: salário + média das parcelas variáveis habituais. */
  remuneracao: number;
  modalidade: Modalidade;
  aviso: TipoAviso;
  /** Dias de saldo de salário; vazio = dia do mês da saída (até 30). */
  diasSaldo?: number;
  /** Períodos de férias vencidos e não gozados, ainda dentro do período concessivo. */
  feriasVencidasSimples: number;
  /** Períodos cujo período concessivo já passou: pagos em dobro (CLT, art. 137). */
  feriasVencidasDobro: number;
  /** Meses em que o FGTS não foi depositado. */
  mesesSemFgts: number;
  /** Saldo do FGTS para fins rescisórios (extrato). Vazio = estimativa. */
  saldoFgts?: number;
  multa477: boolean;
  multa467: boolean;
}

export interface Verba {
  id: string;
  rotulo: string;
  valor: number;
  conta: string;
  base: string;
  /** Entra na base da multa do art. 467 (verbas rescisórias em sentido estrito). */
  rescisoria?: boolean;
}

export interface ResultadoRescisao {
  verbas: Verba[];
  total: number;
  diasAviso: number;
  /** Data final do contrato com a projeção do aviso prévio indenizado (CLT, art. 487, § 1º; OJ 82 da SDI-1). */
  saidaProjetada: string;
  avos13: number;
  avosFerias: number;
  anosDeServico: number;
  avisos: string[];
}

/** Aviso prévio proporcional: 30 dias + 3 por ano completo de serviço, até 90 (Lei 12.506/2011). */
export function diasAvisoPrevio(admissao: string, saida: string): number {
  return Math.min(90, 30 + 3 * anosCompletos(admissao, saida));
}

/**
 * Avos de 13º no ano da saída: cada mês do ano com 15 dias ou mais de trabalho conta 1/12
 * (Lei 4.090/1962, art. 1º, § 2º).
 */
export function avosDecimoTerceiro(admissao: string, fim: string): number {
  const ano = Number(fim.slice(0, 4));
  let avos = 0;
  for (let mes = 1; mes <= 12; mes++) {
    const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
    if (ini > fim) break;
    const ultimo = somarDias(mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`, -1);
    const de = admissao > ini ? admissao : ini;
    const ate = fim < ultimo ? fim : ultimo;
    if (de > ate) continue;
    const dias = Number(ate.slice(8)) - Number(de.slice(8)) + 1;
    if (dias >= 15) avos++;
  }
  return avos;
}

/** Início do período aquisitivo em curso na data `fim` (último aniversário da admissão). */
export function inicioPeriodoAquisitivo(admissao: string, fim: string): string {
  return somarAnos(admissao, anosCompletos(admissao, fim), "ultimo");
}

/**
 * Avos de férias proporcionais no período aquisitivo em curso: cada mês completo conta 1/12 e a
 * fração de mais de 14 dias também (CLT, art. 146, parágrafo único).
 */
export function avosFerias(admissao: string, fim: string): number {
  const { meses, dias } = mesesEDias(inicioPeriodoAquisitivo(admissao, fim), fim);
  return Math.min(12, meses + (dias >= 15 ? 1 : 0));
}

const FGTS = 0.08;

export function calcularRescisao(e: EntradaRescisao): ResultadoRescisao {
  const r = e.remuneracao;
  const dia = r / 30;
  const m = e.modalidade;
  const avisos: string[] = [];
  const verbas: Verba[] = [];
  const add = (v: Omit<Verba, "valor"> & { valor: number }) => {
    const valor = centavos(v.valor);
    if (valor > 0) verbas.push({ ...v, valor });
  };

  const anos = anosCompletos(e.admissao, e.saida);
  const diasAvisoLei = diasAvisoPrevio(e.admissao, e.saida);
  const empregadorDeveAviso = m === "sem_justa_causa" || m === "rescisao_indireta" || m === "acordo";
  const avisoIndenizado = empregadorDeveAviso && e.aviso === "indenizado";
  // No acordo do art. 484-A, o aviso indenizado é pago pela metade (inciso I, "a").
  const diasAvisoPagos = avisoIndenizado ? (m === "acordo" ? diasAvisoLei / 2 : diasAvisoLei) : 0;
  const diasProjecao = avisoIndenizado ? Math.floor(diasAvisoPagos) : 0;
  // Súmula 380 do TST: exclui-se o dia do começo e inclui-se o do vencimento.
  const saidaProjetada = somarDias(e.saida, diasProjecao);
  if (m === "acordo" && avisoIndenizado) avisos.push("No acordo do art. 484-A, a projeção do aviso pela metade dos dias não é pacífica; confira a data de saída anotada.");
  if (empregadorDeveAviso && e.aviso === "trabalhado") avisos.push("Aviso trabalhado: informe como saída o último dia do aviso. A redução de jornada (art. 488) não muda as verbas.");

  // Saldo de salário
  const diasSaldo = e.diasSaldo ?? Math.min(30, Number(e.saida.slice(8)));
  add({ id: "saldo", rotulo: "Saldo de salário", valor: dia * diasSaldo, conta: `${reais(r)} ÷ 30 × ${diasSaldo} dia(s)`, base: "CLT, arts. 459 e 462", rescisoria: true });

  // Aviso prévio indenizado
  if (avisoIndenizado) {
    add({
      id: "aviso",
      rotulo: m === "acordo" ? "Aviso prévio indenizado (metade)" : "Aviso prévio indenizado",
      valor: dia * diasAvisoPagos,
      conta: `${reais(r)} ÷ 30 × ${diasAvisoPagos} dias (30 + 3 × ${anos} ano(s)${m === "acordo" ? ", pela metade" : ""})`,
      base: m === "acordo" ? "CLT, art. 484-A, I, a; Lei 12.506/2011" : "CLT, art. 487, § 1º; Lei 12.506/2011; Súmula 441 do TST",
      rescisoria: true,
    });
  }

  // 13º proporcional (não é devido na justa causa)
  const avos13 = m === "justa_causa" ? 0 : avosDecimoTerceiro(e.admissao, saidaProjetada);
  if (m === "justa_causa") avisos.push("Justa causa: não são devidos 13º proporcional (Lei 4.090/1962, art. 3º) nem férias proporcionais (Súmula 171 do TST).");
  add({ id: "13", rotulo: `13º salário proporcional (${avos13}/12)`, valor: (r / 12) * avos13, conta: `${reais(r)} ÷ 12 × ${avos13}`, base: "Lei 4.090/1962, arts. 1º e 3º", rescisoria: true });

  // Férias
  if (e.feriasVencidasDobro > 0) {
    add({ id: "ferias-dobro", rotulo: `Férias vencidas em dobro + 1/3 (${e.feriasVencidasDobro} período(s))`, valor: r * (4 / 3) * 2 * e.feriasVencidasDobro, conta: `${reais(r)} × 4/3 × 2 × ${e.feriasVencidasDobro}`, base: "CLT, art. 137; CF, art. 7º, XVII; Súmula 328 do TST", rescisoria: true });
  }
  if (e.feriasVencidasSimples > 0) {
    add({ id: "ferias-vencidas", rotulo: `Férias vencidas simples + 1/3 (${e.feriasVencidasSimples} período(s))`, valor: r * (4 / 3) * e.feriasVencidasSimples, conta: `${reais(r)} × 4/3 × ${e.feriasVencidasSimples}`, base: "CLT, art. 146, caput; CF, art. 7º, XVII", rescisoria: true });
  }
  const avosF = m === "justa_causa" ? 0 : avosFerias(e.admissao, saidaProjetada);
  add({ id: "ferias-prop", rotulo: `Férias proporcionais + 1/3 (${avosF}/12)`, valor: (r / 12) * avosF * (4 / 3), conta: `${reais(r)} ÷ 12 × ${avosF} × 4/3`, base: "CLT, art. 146, parágrafo único; Súmulas 171 e 261 do TST; CF, art. 7º, XVII", rescisoria: true });

  // FGTS sobre as verbas da rescisão: saldo, aviso indenizado e 13º (não incide sobre férias indenizadas).
  const baseFgtsRescisao = (verbas.find((v) => v.id === "saldo")?.valor ?? 0) + (verbas.find((v) => v.id === "aviso")?.valor ?? 0) + (verbas.find((v) => v.id === "13")?.valor ?? 0);
  const fgtsRescisao = centavos(baseFgtsRescisao * FGTS);
  add({ id: "fgts-rescisao", rotulo: "FGTS (8%) sobre saldo, aviso e 13º da rescisão", valor: fgtsRescisao, conta: `${reais(baseFgtsRescisao)} × 8%`, base: "Lei 8.036/1990, art. 15; Súmula 305 do TST; OJ 195 da SDI-1" });

  const fgtsAtrasado = centavos(r * FGTS * e.mesesSemFgts);
  add({ id: "fgts-atrasado", rotulo: `FGTS não depositado (${e.mesesSemFgts} mês(es))`, valor: fgtsAtrasado, conta: `${reais(r)} × 8% × ${e.mesesSemFgts}`, base: "Lei 8.036/1990, art. 15" });

  // Multa do FGTS
  const percMulta = m === "sem_justa_causa" || m === "rescisao_indireta" ? 0.4 : m === "acordo" ? 0.2 : 0;
  if (percMulta > 0) {
    const { meses, dias } = mesesEDias(e.admissao, e.saida);
    const mesesContrato = meses + dias / 30;
    // Estimativa dos depósitos do contrato: 8% sobre 12 salários + 13º + 1/3 de férias gozadas por ano (40/36 da remuneração por mês).
    const estimado = e.saldoFgts === undefined;
    const depositos = estimado ? centavos(r * FGTS * mesesContrato * (40 / 36)) : centavos(e.saldoFgts! + fgtsAtrasado);
    const baseMulta = centavos(depositos + fgtsRescisao);
    if (estimado) avisos.push(`A multa do FGTS usou depósitos estimados (${reais(depositos)}: 8% da remuneração por ${mesesContrato.toFixed(1).replace(".", ",")} meses, com 13º e 1/3 de férias). Informe o saldo do extrato para o valor exato.`);
    add({
      id: "multa-fgts",
      rotulo: `Multa de ${percMulta * 100}% do FGTS`,
      valor: baseMulta * percMulta,
      conta: `(${estimado ? "depósitos estimados" : "saldo do extrato + FGTS não depositado"} ${reais(depositos)} + FGTS da rescisão ${reais(fgtsRescisao)}) × ${percMulta * 100}%`,
      base: m === "acordo" ? "CLT, art. 484-A, I, b" : "Lei 8.036/1990, art. 18, § 1º",
      rescisoria: true,
    });
  }

  // Multa do art. 467: 50% das verbas rescisórias incontroversas não pagas na primeira audiência.
  if (e.multa467) {
    const base467 = verbas.filter((v) => v.rescisoria).reduce((s, v) => s + v.valor, 0);
    add({ id: "multa-467", rotulo: "Multa do art. 467 da CLT (50%)", valor: base467 * 0.5, conta: `${reais(base467)} (verbas rescisórias) × 50%`, base: "CLT, art. 467" });
    avisos.push("A multa do art. 467 só incide sobre a parte incontroversa não paga na primeira audiência; se a modalidade da rescisão for discutida, o juiz pode afastá-la.");
  }
  // Multa do art. 477, § 8º: atraso no pagamento das verbas (prazo de 10 dias do § 6º).
  if (e.multa477) {
    add({ id: "multa-477", rotulo: "Multa do art. 477, § 8º, da CLT", valor: r, conta: `um salário: ${reais(r)}`, base: "CLT, art. 477, §§ 6º e 8º; Súmula 462 do TST" });
    avisos.push("A multa do art. 477, § 8º, equivale ao salário; se a remuneração informada tiver parcelas variáveis, ajuste para o salário-base.");
  }

  const total = centavos(verbas.reduce((s, v) => s + v.valor, 0));
  return { verbas, total, diasAviso: diasAvisoLei, saidaProjetada, avos13, avosFerias: avosF, anosDeServico: anos, avisos };
}

// ---------- Pedidos acessórios ----------

export const DIVISORES = [
  { horas: 44, divisor: 220, base: "CLT, art. 64; Súmula 431 do TST" },
  { horas: 40, divisor: 200, base: "Súmula 431 do TST" },
  { horas: 36, divisor: 180, base: "CLT, art. 64" },
  { horas: 30, divisor: 150, base: "CLT, art. 64" },
];

export interface EntradaHorasExtras {
  remuneracao: number;
  divisor: number;
  /** Adicional em %: no mínimo 50 (CF, art. 7º, XVI). */
  adicional: number;
  horasPorMes: number;
  meses: number;
  /** Reflexo no descanso semanal remunerado, em % (ex.: 16,67 = 1/6). 0 = sem reflexo. */
  reflexoDsr: number;
  reflexos: boolean;
  /** Soma a multa de 40% sobre o FGTS dos reflexos (dispensa sem justa causa ou rescisão indireta). */
  multaFgts: boolean;
}

export function calcularHorasExtras(e: EntradaHorasExtras): { linhas: Verba[]; total: number; avisos: string[] } {
  const avisos: string[] = [];
  if (e.adicional < 50) avisos.push("O adicional de hora extra é de no mínimo 50% (CF, art. 7º, XVI).");
  const hora = e.remuneracao / e.divisor;
  const valorHE = hora * (1 + e.adicional / 100);
  const linhas: Verba[] = [];
  const he = centavos(valorHE * e.horasPorMes * e.meses);
  linhas.push({ id: "he", rotulo: "Horas extras", valor: he, conta: `${reais(e.remuneracao)} ÷ ${e.divisor} × ${1 + e.adicional / 100} × ${e.horasPorMes} h × ${e.meses} mês(es)`, base: "CF, art. 7º, XVI; CLT, art. 59; Súmula 264 do TST" });
  let principal = he;
  if (e.reflexoDsr > 0) {
    const dsr = centavos(he * (e.reflexoDsr / 100));
    linhas.push({ id: "dsr", rotulo: "Reflexo em DSR", valor: dsr, conta: `${reais(he)} × ${e.reflexoDsr}%`, base: "Lei 605/1949, art. 7º; Súmula 172 do TST" });
    principal += dsr;
  }
  if (e.reflexos) {
    const r13 = centavos(principal / 12);
    const rFerias = centavos((principal / 12) * (4 / 3));
    linhas.push({ id: "r13", rotulo: "Reflexo em 13º salários", valor: r13, conta: `${reais(principal)} ÷ 12`, base: "Súmula 45 do TST" });
    linhas.push({ id: "rferias", rotulo: "Reflexo em férias + 1/3", valor: rFerias, conta: `${reais(principal)} ÷ 12 × 4/3`, base: "CLT, art. 142, § 5º" });
    const baseFgts = principal + r13 + rFerias;
    const fgts = centavos(baseFgts * FGTS);
    linhas.push({ id: "rfgts", rotulo: "Reflexo em FGTS (8%)", valor: fgts, conta: `${reais(baseFgts)} × 8%`, base: "Lei 8.036/1990, art. 15; Súmula 63 do TST" });
    if (e.multaFgts) linhas.push({ id: "rmulta", rotulo: "Multa de 40% sobre o FGTS dos reflexos", valor: centavos(fgts * 0.4), conta: `${reais(fgts)} × 40%`, base: "Lei 8.036/1990, art. 18, § 1º" });
    avisos.push("Reflexos estimados pela média: 1/12 por 13º e por férias a cada mês com horas extras. Para fatos a partir de 20/03/2023, o DSR majorado repercute nas demais parcelas (TST, IRR 10169-57.2013.5.05.0024); antes disso, não (OJ 394 da SDI-1).");
  }
  return { linhas, total: centavos(linhas.reduce((s, l) => s + l.valor, 0)), avisos };
}

export type NaturezaDano = "leve" | "media" | "grave" | "gravissima";

/** Parâmetros do art. 223-G, § 1º, da CLT (múltiplos do último salário contratual). */
export const DANO_EXTRAPATRIMONIAL: Record<NaturezaDano, { rotulo: string; vezes: number; inciso: string }> = {
  leve: { rotulo: "Leve", vezes: 3, inciso: "I" },
  media: { rotulo: "Média", vezes: 5, inciso: "II" },
  grave: { rotulo: "Grave", vezes: 20, inciso: "III" },
  gravissima: { rotulo: "Gravíssima", vezes: 50, inciso: "IV" },
};

export function referenciaDanoMoral(natureza: NaturezaDano, salario: number) {
  const d = DANO_EXTRAPATRIMONIAL[natureza];
  return {
    limite: centavos(salario * d.vezes),
    conta: `${d.vezes} × ${reais(salario)}`,
    base: `CLT, art. 223-G, § 1º, ${d.inciso}`,
    aviso: "O STF (ADIs 6.050, 6.069 e 6.082, junho de 2023) decidiu que esses valores orientam o juiz, mas não são teto: a indenização pode ser maior, com fundamentação.",
  };
}

/**
 * Prestações vincendas: por tempo indeterminado ou por mais de um ano, entra uma prestação anual
 * (12 parcelas); por menos de um ano, a soma das parcelas (CPC, art. 292, §§ 1º e 2º).
 */
export function valorVincendas(mensal: number, meses: number | null): { valor: number; conta: string } {
  const n = meses === null || meses > 12 ? 12 : meses;
  return { valor: centavos(mensal * n), conta: `${reais(mensal)} × ${n}${meses === null || meses > 12 ? " (uma prestação anual)" : ""}` };
}

// ---------- Valor da causa e rito ----------

export interface Pedido {
  id: string;
  descricao: string;
  valor: number;
  base?: string;
}

export type Rito = "sumario" | "sumarissimo" | "ordinario";

export const RITOS: Record<Rito, { rotulo: string; base: string; regra: string }> = {
  sumario: {
    rotulo: "Sumário (dissídio de alçada)",
    base: "Lei 5.584/1970, art. 2º, §§ 3º e 4º",
    regra: "Até 2 salários mínimos. Sem recurso, salvo matéria constitucional.",
  },
  sumarissimo: {
    rotulo: "Sumaríssimo",
    base: "CLT, arts. 852-A a 852-I",
    regra: "Até 40 salários mínimos. Pedidos líquidos, até 2 testemunhas por parte, audiência única. Não se aplica à administração pública direta, autárquica e fundacional (art. 852-A, parágrafo único).",
  },
  ordinario: { rotulo: "Ordinário", base: "CLT, arts. 837 a 852", regra: "Acima de 40 salários mínimos (ou quando a parte é ente público)." },
};

export interface ResultadoValorCausa {
  total: number;
  rito: Rito;
  salarioMinimo: number;
  emSalariosMinimos: number;
  custas: { valor: number; conta: string; minimo: number; maximo: number };
  honorarios: { min: number; max: number };
  linhas: Linha[];
  avisos: string[];
}

/** Custas na fase de conhecimento: 2%, mínimo R$ 10,64, máximo 4 vezes o teto do RGPS (CLT, art. 789). */
export function custasTrabalhistas(base: number, ano: number) {
  const minimo = 10.64;
  const maximo = centavos(4 * tetoRgps(ano));
  const bruto = centavos(base * 0.02);
  const valor = Math.min(maximo, Math.max(minimo, bruto));
  const conta = bruto < minimo ? `2% de ${reais(base)} = ${reais(bruto)}, abaixo do mínimo` : bruto > maximo ? `2% de ${reais(base)} = ${reais(bruto)}, limitado a 4 × ${reais(tetoRgps(ano))}` : `2% de ${reais(base)}`;
  return { valor, conta, minimo, maximo };
}

export function calcularValorDaCausa(pedidos: Pedido[], opcoes: { ano: number; salarioMinimo?: number; entePublico?: boolean }): ResultadoValorCausa {
  const sm = opcoes.salarioMinimo ?? salarioMinimo(opcoes.ano);
  const validos = pedidos.filter((p) => p.valor > 0);
  const total = centavos(validos.reduce((s, p) => s + p.valor, 0));
  const emSm = total / sm;
  const rito: Rito = opcoes.entePublico ? (total <= 2 * sm ? "sumario" : "ordinario") : total <= 2 * sm ? "sumario" : total <= 40 * sm ? "sumarissimo" : "ordinario";
  const custas = custasTrabalhistas(total, opcoes.ano);
  const avisos: string[] = [];
  if (validos.length < pedidos.length) avisos.push("Pedidos sem valor não entram na soma; o art. 840, § 1º, da CLT exige a indicação do valor de cada pedido, sob pena de extinção sem resolução do mérito (§ 3º).");
  if (rito === "sumarissimo") avisos.push("No sumaríssimo, o pedido deve ser certo ou determinado com valor correspondente, e o autor deve indicar o nome e o endereço corretos do réu: não cabe citação por edital (CLT, art. 852-B, I e II).");
  if (opcoes.entePublico && total > 2 * sm && total <= 40 * sm) avisos.push("Ente público na causa: segue o rito ordinário mesmo até 40 salários mínimos (CLT, art. 852-A, parágrafo único).");
  avisos.push("A alçada se mede pelo salário mínimo vigente na data do ajuizamento (Súmula 356 do TST) e o valor dos pedidos não limita a condenação quando indicado por estimativa (IN 41/2018 do TST, art. 12, § 2º).");
  const linhas: Linha[] = [
    ...validos.map((p) => ({ rotulo: p.descricao || "Pedido", valor: reais(p.valor), base: p.base })),
    { rotulo: "Valor da causa", valor: reais(total), conta: "soma dos pedidos", base: "CPC, art. 292, VI; CLT, art. 840, § 1º", destaque: true },
    { rotulo: "Em salários mínimos", valor: `${emSm.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} SM`, conta: `${reais(total)} ÷ ${reais(sm)}` },
    { rotulo: "Rito", valor: RITOS[rito].rotulo, base: RITOS[rito].base, destaque: true },
    { rotulo: "Custas se o pedido for rejeitado ou arquivado", valor: reais(custas.valor), conta: custas.conta, base: "CLT, art. 789, II e IV" },
    { rotulo: "Honorários de sucumbência (faixa legal)", valor: `${reais(total * 0.05)} a ${reais(total * 0.15)}`, conta: "5% a 15%", base: "CLT, art. 791-A" },
  ];
  return { total, rito, salarioMinimo: sm, emSalariosMinimos: emSm, custas, honorarios: { min: centavos(total * 0.05), max: centavos(total * 0.15) }, linhas, avisos };
}

/** Linhas da rescisão para a memória de cálculo. */
export function linhasRescisao(r: ResultadoRescisao, e: EntradaRescisao): Linha[] {
  return [
    { rotulo: "Tempo de serviço", valor: `${r.anosDeServico} ano(s) completo(s)`, conta: `${dataBR(e.admissao)} a ${dataBR(e.saida)}` },
    ...(r.saidaProjetada !== e.saida ? [{ rotulo: "Saída com a projeção do aviso", valor: dataBR(r.saidaProjetada), base: "CLT, art. 487, § 1º; OJ 82 da SDI-1" }] : []),
    ...r.verbas.map((v) => ({ rotulo: v.rotulo, valor: reais(v.valor), conta: v.conta, base: v.base })),
    { rotulo: "Total das verbas", valor: reais(r.total), destaque: true },
  ];
}
