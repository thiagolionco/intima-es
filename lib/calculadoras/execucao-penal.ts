/**
 * Progressão de regime (LEP, art. 112, redação da Lei 13.964/2019 e da Lei 14.994/2024) e
 * livramento condicional (CP, art. 83). É uma estimativa: a referência oficial é o SEEU.
 */
import { dataBR, deDias, duracaoTexto, emDias, somarDuracao, type Duracao, type Linha } from "./base.ts";

export const FAIXAS_PROGRESSAO = [
  { id: "16", perc: 16, inciso: "I", rotulo: "Primário, crime sem violência ou grave ameaça" },
  { id: "20", perc: 20, inciso: "II", rotulo: "Reincidente em crime sem violência ou grave ameaça" },
  { id: "25", perc: 25, inciso: "III", rotulo: "Primário, crime com violência ou grave ameaça" },
  { id: "30", perc: 30, inciso: "IV", rotulo: "Reincidente em crime com violência ou grave ameaça" },
  { id: "40", perc: 40, inciso: "V", rotulo: "Primário, crime hediondo ou equiparado" },
  { id: "50", perc: 50, inciso: "VI", rotulo: "Hediondo com resultado morte (primário), comando de organização criminosa ou milícia privada" },
  { id: "55", perc: 55, inciso: "VI-A", rotulo: "Feminicídio, se primário" },
  { id: "60", perc: 60, inciso: "VII", rotulo: "Reincidente em crime hediondo ou equiparado" },
  { id: "70", perc: 70, inciso: "VIII", rotulo: "Reincidente em hediondo com resultado morte" },
  { id: "gestante", perc: 12.5, inciso: "§ 3º", rotulo: "Gestante, mãe ou responsável por criança ou pessoa com deficiência (1/8)" },
];

export const FRACOES_LIVRAMENTO = [
  { id: "terco", num: 1, den: 3, rotulo: "Mais de 1/3: não reincidente em crime doloso e com bons antecedentes", base: "CP, art. 83, I" },
  { id: "metade", num: 1, den: 2, rotulo: "Mais da metade: reincidente em crime doloso", base: "CP, art. 83, II" },
  { id: "dois-tercos", num: 2, den: 3, rotulo: "Mais de 2/3: hediondo, tráfico, tortura, terrorismo ou tráfico de pessoas (não reincidente específico)", base: "CP, art. 83, V" },
];

export interface ResultadoExecucao {
  progressao: { fracao: number; data: string };
  livramento?: { fracao: number; data: string };
  linhas: Linha[];
  avisos: string[];
}

export function calcularExecucao(e: { pena: Duracao; dataBase: string; faixaProgressao: string; livramento: string | null; diasRemidos: number; diasDetracao: number }): ResultadoExecucao {
  const total = emDias(e.pena);
  const faixa = FAIXAS_PROGRESSAO.find((f) => f.id === e.faixaProgressao) ?? FAIXAS_PROGRESSAO[0];
  const descontos = Math.max(0, e.diasRemidos) + Math.max(0, e.diasDetracao);
  const linhas: Linha[] = [{ rotulo: "Pena total", valor: duracaoTexto(e.pena) }, { rotulo: "Data-base", valor: dataBR(e.dataBase), conta: "prisão, última progressão ou última falta grave (Súmula 534 do STJ)" }];
  const fracaoP = Math.floor((total * faixa.perc) / 100);
  const aCumprirP = Math.max(0, fracaoP - descontos);
  const dataP = somarDuracao(e.dataBase, deDias(aCumprirP));
  linhas.push({ rotulo: `Progressão (${faixa.perc.toLocaleString("pt-BR")}%)`, valor: duracaoTexto(fracaoP), conta: faixa.rotulo, base: `LEP, art. 112, ${faixa.inciso}` });
  if (descontos) linhas.push({ rotulo: "Remição e detração", valor: `− ${descontos} dia(s)`, base: "LEP, arts. 126 a 128; CP, art. 42" });
  linhas.push({ rotulo: "Data estimada da progressão", valor: dataBR(dataP), destaque: true });
  let livramento: ResultadoExecucao["livramento"];
  const avisos = [
    "Além do tempo, a progressão exige boa conduta carcerária atestada pelo diretor (LEP, art. 112, § 1º). Pena acima de 30 anos: a unificação do art. 75 do CP não vale para o cálculo de benefícios (Súmula 715 do STF).",
    "Reincidência não específica em hediondo: o STF e o STJ aplicam 40% ao reincidente genérico (STF, ARE 1.327.963, Tema 1.169).",
    "Convenção de cálculo: 1 ano = 12 meses e 1 mês = 30 dias, somados à data-base pelo calendário. O SEEU pode diferir em poucos dias.",
  ];
  if (e.livramento) {
    const fr = FRACOES_LIVRAMENTO.find((f) => f.id === e.livramento)!;
    if (total < 720) avisos.push("Livramento condicional exige pena igual ou superior a 2 anos (CP, art. 83, caput).");
    if (["50", "55", "70"].includes(faixa.id)) avisos.push("Nesta hipótese do art. 112 é vedado o livramento condicional.");
    const fracaoL = Math.floor((total * fr.num) / fr.den);
    const dataL = somarDuracao(e.dataBase, deDias(Math.max(0, fracaoL - descontos)));
    livramento = { fracao: fracaoL, data: dataL };
    linhas.push({ rotulo: `Livramento condicional (${fr.num}/${fr.den})`, valor: duracaoTexto(fracaoL), conta: fr.rotulo, base: fr.base });
    linhas.push({ rotulo: "Data estimada do livramento", valor: dataBR(dataL), conta: "requisito objetivo: cumprir mais que a fração", destaque: true });
    avisos.push("O livramento se conta sobre a pena total desde o início do cumprimento, e a falta grave não interrompe esse prazo (Súmula 441 do STJ): se a data-base acima for de progressão ou falta grave, refaça com a data do início da pena.");
  }
  return { progressao: { fracao: fracaoP, data: dataP }, livramento, linhas, avisos };
}
