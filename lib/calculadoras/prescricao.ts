/**
 * Prazos prescricionais: cível, consumidor, Fazenda Pública, tributário, trabalhista e penal.
 *
 * Contagem:
 * - Direito civil e trabalhista: exclui o dia do começo e o prazo em anos vence no dia de igual
 *   número do ano final, ou no seguinte se faltar correspondência (CC, art. 132, caput e § 3º).
 *   Vencendo em dia sem expediente, a ação pode ser proposta no primeiro dia útil seguinte
 *   (art. 132, § 1º).
 * - Direito penal: o dia do começo inclui-se no cômputo (CP, art. 10), então o prazo termina na
 *   véspera do dia de igual número; não há prorrogação por feriado.
 */
import { Calendario } from "../prazos/calendario.ts";
import { dataBR, diasEntre, duracaoTexto, emDias, somarDias, somarMeses, type Duracao, type Linha } from "./base.ts";

export interface HipotesePrescricao {
  id: string;
  rotulo: string;
  anos: number;
  base: string;
  grupo: "Cível" | "Consumidor" | "Fazenda Pública e tributário";
  /** Direito privado: sujeito à suspensão da Lei 14.010/2020 (pandemia). */
  privado: boolean;
  termo: string;
  nota?: string;
}

export const HIPOTESES: HipotesePrescricao[] = [
  { id: "geral", rotulo: "Regra geral (sem prazo menor previsto)", anos: 10, base: "CC, art. 205", grupo: "Cível", privado: true, termo: "Violação do direito (art. 189)" },
  { id: "contratual", rotulo: "Responsabilidade contratual (inadimplemento)", anos: 10, base: "CC, art. 205; STJ, EREsp 1.280.825/RJ e EREsp 1.281.594/SP", grupo: "Cível", privado: true, termo: "Inadimplemento" },
  { id: "reparacao", rotulo: "Reparação civil (responsabilidade extracontratual)", anos: 3, base: "CC, art. 206, § 3º, V", grupo: "Cível", privado: true, termo: "Dano ou ciência inequívoca do dano e da autoria (actio nata)" },
  { id: "enriquecimento", rotulo: "Enriquecimento sem causa", anos: 3, base: "CC, art. 206, § 3º, IV", grupo: "Cível", privado: true, termo: "Enriquecimento" },
  { id: "alugueis", rotulo: "Aluguéis de prédios urbanos ou rústicos", anos: 3, base: "CC, art. 206, § 3º, I", grupo: "Cível", privado: true, termo: "Vencimento de cada aluguel" },
  { id: "rendas", rotulo: "Rendas temporárias ou vitalícias; juros e dividendos", anos: 3, base: "CC, art. 206, § 3º, II e III", grupo: "Cível", privado: true, termo: "Vencimento de cada prestação" },
  { id: "titulo", rotulo: "Pagamento de título de crédito (lei especial omissa)", anos: 3, base: "CC, art. 206, § 3º, VIII", grupo: "Cível", privado: true, termo: "Vencimento", nota: "Cheque, nota promissória e duplicata têm prazos próprios para a execução (Lei 7.357/1985, art. 59; Decreto 57.663/1966, art. 70; Lei 5.474/1968, art. 18)." },
  { id: "seguro", rotulo: "Segurado contra o segurador (e vice-versa)", anos: 1, base: "CC, art. 206, § 1º, II; Súmula 101 do STJ", grupo: "Cível", privado: true, termo: "Ciência do fato gerador da pretensão" },
  { id: "hospedagem", rotulo: "Hospedeiros e fornecedores de víveres", anos: 1, base: "CC, art. 206, § 1º, I", grupo: "Cível", privado: true, termo: "Vencimento" },
  { id: "alimentos", rotulo: "Prestações alimentares", anos: 2, base: "CC, art. 206, § 2º", grupo: "Cível", privado: true, termo: "Vencimento de cada prestação", nota: "Não corre entre ascendentes e descendentes durante o poder familiar (CC, art. 197, II)." },
  { id: "tutela", rotulo: "Pretensão relativa à tutela (prestação de contas)", anos: 4, base: "CC, art. 206, § 4º", grupo: "Cível", privado: true, termo: "Aprovação das contas" },
  { id: "divida-liquida", rotulo: "Dívida líquida em instrumento público ou particular", anos: 5, base: "CC, art. 206, § 5º, I", grupo: "Cível", privado: true, termo: "Vencimento" },
  { id: "honorarios", rotulo: "Honorários de profissionais liberais", anos: 5, base: "CC, art. 206, § 5º, II; Lei 8.906/1994, art. 25", grupo: "Cível", privado: true, termo: "Conclusão do serviço, trânsito em julgado, renúncia ou revogação do mandato" },
  { id: "cdc-fato", rotulo: "Danos por fato do produto ou do serviço", anos: 5, base: "CDC, art. 27", grupo: "Consumidor", privado: true, termo: "Conhecimento do dano e da autoria", nota: "Vício aparente ou de fácil constatação é prazo decadencial de 30 dias (não duráveis) ou 90 dias (duráveis), CDC, art. 26." },
  { id: "fazenda", rotulo: "Contra a Fazenda Pública (União, Estados, Municípios)", anos: 5, base: "Decreto 20.910/1932, art. 1º; Súmula 85 do STJ", grupo: "Fazenda Pública e tributário", privado: false, termo: "Ato ou fato que deu origem ao direito", nota: "Em relações de trato sucessivo, prescrevem só as prestações anteriores a 5 anos da propositura (Súmula 85 do STJ)." },
  { id: "tributo-cobranca", rotulo: "Cobrança do crédito tributário (Fazenda contra contribuinte)", anos: 5, base: "CTN, art. 174", grupo: "Fazenda Pública e tributário", privado: false, termo: "Constituição definitiva do crédito" },
  { id: "tributo-restituicao", rotulo: "Restituição de tributo pago indevidamente", anos: 5, base: "CTN, arts. 165 e 168, I; LC 118/2005, art. 3º", grupo: "Fazenda Pública e tributário", privado: false, termo: "Extinção do crédito (pagamento)" },
];

/** Lei 14.010/2020, art. 3º: prazos prescricionais impedidos ou suspensos de 12/06/2020 a 30/10/2020. */
export const SUSPENSAO_PANDEMIA = { inicio: "2020-06-12", fim: "2020-10-30", base: "Lei 14.010/2020, art. 3º (RJET)" };

export interface ResultadoPrescricao {
  /** Último dia para propor a ação. */
  fim: string;
  /** Primeiro dia útil, quando o último dia cai sem expediente. */
  prorrogadoPara?: string;
  diasSuspensos: number;
  prescrito: boolean;
  diasRestantes: number;
  linhas: Linha[];
  avisos: string[];
}

function sobreposicao(a1: string, a2: string, b1: string, b2: string): number {
  const ini = a1 > b1 ? a1 : b1;
  const fim = a2 < b2 ? a2 : b2;
  return ini > fim ? 0 : diasEntre(ini, fim) + 1;
}

/** Prescrição cível, de consumo, contra a Fazenda e tributária. */
export function prescricaoCivel(hipotese: HipotesePrescricao, termoInicial: string, hoje: string, opcoes: { pandemia?: boolean; anos?: number } = {}): ResultadoPrescricao {
  const anos = opcoes.anos ?? hipotese.anos;
  const semSuspensao = somarMeses(termoInicial, anos * 12, "seguinte");
  const avisos: string[] = [];
  let suspensos = 0;
  if (hipotese.privado && opcoes.pandemia !== false) {
    // Dias do prazo que caíram dentro da suspensão: o prazo começa a correr no dia seguinte ao termo inicial.
    suspensos = sobreposicao(somarDias(termoInicial, 1), semSuspensao, SUSPENSAO_PANDEMIA.inicio, SUSPENSAO_PANDEMIA.fim);
  }
  const fim = somarDias(semSuspensao, suspensos);
  const cal = new Calendario("");
  const prorrogadoPara = cal.ehUtil(fim) ? undefined : cal.proximoUtil(fim);
  const limite = prorrogadoPara ?? fim;
  const linhas: Linha[] = [
    { rotulo: "Prazo", valor: `${anos} ${anos === 1 ? "ano" : "anos"}`, base: hipotese.base },
    { rotulo: "Termo inicial", valor: dataBR(termoInicial), conta: hipotese.termo },
    { rotulo: "Vencimento sem suspensões", valor: dataBR(semSuspensao), conta: "dia de igual número do ano final", base: "CC, art. 132, § 3º" },
  ];
  if (suspensos) linhas.push({ rotulo: "Dias suspensos (pandemia)", valor: `+ ${suspensos} dia(s)`, conta: `${dataBR(SUSPENSAO_PANDEMIA.inicio)} a ${dataBR(SUSPENSAO_PANDEMIA.fim)}`, base: SUSPENSAO_PANDEMIA.base });
  linhas.push({ rotulo: "Prescreve em", valor: dataBR(fim), destaque: true });
  if (prorrogadoPara) linhas.push({ rotulo: "Sem expediente nesse dia: ajuizar até", valor: dataBR(prorrogadoPara), base: "CC, art. 132, § 1º", destaque: true });
  if (hipotese.nota) avisos.push(hipotese.nota);
  avisos.push("Não corre contra absolutamente incapazes nem entre cônjuges na constância da sociedade conjugal (CC, arts. 197 e 198). A interrupção (art. 202) só ocorre uma vez e reinicia o prazo do ato que a interrompeu: use a data desse ato como termo inicial.");
  if (prorrogadoPara) avisos.push("A prorrogação considera só os feriados nacionais; confira feriados locais e suspensões do tribunal.");
  return { fim, prorrogadoPara, diasSuspensos: suspensos, prescrito: limite < hoje, diasRestantes: diasEntre(hoje, limite), linhas, avisos };
}

// ---------- Trabalhista ----------

export interface ResultadoTrabalhista {
  /** Último dia para ajuizar (prescrição bienal). */
  limiteBienal?: string;
  prorrogadoPara?: string;
  bienalOk: boolean;
  /** Créditos exigíveis antes desta data estão prescritos (prescrição quinquenal). */
  marcoQuinquenal: string;
  linhas: Linha[];
  avisos: string[];
}

/**
 * CF, art. 7º, XXIX, e CLT, art. 11: 5 anos contados do ajuizamento para trás, até o limite de
 * 2 anos após a extinção do contrato. O prazo bienal corre do fim do aviso prévio, ainda que
 * indenizado (OJ 83 da SDI-1); o quinquenal se conta do ajuizamento (Súmula 308, I, do TST).
 */
export function prescricaoTrabalhista(extincao: string | null, ajuizamento: string, diasAviso = 0): ResultadoTrabalhista {
  const marcoQuinquenal = somarMeses(ajuizamento, -60, "seguinte");
  const linhas: Linha[] = [];
  const avisos: string[] = [];
  let limiteBienal: string | undefined;
  let prorrogadoPara: string | undefined;
  let bienalOk = true;
  if (extincao) {
    const fimContrato = somarDias(extincao, diasAviso);
    limiteBienal = somarMeses(fimContrato, 24, "seguinte");
    const cal = new Calendario("");
    prorrogadoPara = cal.ehUtil(limiteBienal) ? undefined : cal.proximoUtil(limiteBienal);
    bienalOk = ajuizamento <= (prorrogadoPara ?? limiteBienal);
    linhas.push({ rotulo: "Fim do contrato", valor: dataBR(fimContrato), conta: diasAviso ? `${dataBR(extincao)} + ${diasAviso} dias de aviso prévio` : undefined, base: diasAviso ? "OJ 83 da SDI-1 do TST" : undefined });
    linhas.push({ rotulo: "Prazo para ajuizar (bienal)", valor: dataBR(limiteBienal), conta: "2 anos do fim do contrato", base: "CF, art. 7º, XXIX; CLT, art. 11", destaque: true });
    if (prorrogadoPara) linhas.push({ rotulo: "Sem expediente nesse dia: ajuizar até", valor: dataBR(prorrogadoPara), base: "CC, art. 132, § 1º, c/c CLT, art. 8º", destaque: true });
    linhas.push({ rotulo: "Situação na data de ajuizamento", valor: bienalOk ? "Dentro do prazo bienal" : "Prescrição bienal consumada", destaque: true });
  } else {
    linhas.push({ rotulo: "Contrato", valor: "Em vigor: não corre o prazo bienal" });
  }
  linhas.push({ rotulo: "Ajuizamento", valor: dataBR(ajuizamento) });
  linhas.push({ rotulo: "Marco da prescrição quinquenal", valor: dataBR(marcoQuinquenal), conta: "5 anos antes do ajuizamento", base: "CF, art. 7º, XXIX; Súmula 308, I, do TST", destaque: true });
  avisos.push(`Só são exigíveis os créditos com vencimento a partir de ${dataBR(marcoQuinquenal)}. Limite os meses dos pedidos (horas extras, diferenças) a esse período.`);
  avisos.push("FGTS: prazo quinquenal para ciência da lesão a partir de 13/11/2014; para os prazos que já corriam, vale o que terminar primeiro entre 30 anos do termo inicial e 5 anos a partir de 13/11/2014 (STF, ARE 709.212; Súmula 362 do TST).");
  avisos.push("Não corre prescrição contra menores de 18 anos (CLT, art. 440). A reclamação arquivada interrompe a prescrição só quanto aos pedidos idênticos (CLT, art. 11, § 3º; Súmula 268 do TST).");
  return { limiteBienal, prorrogadoPara, bienalOk, marcoQuinquenal, linhas, avisos };
}

// ---------- Penal ----------

/** Prazo do art. 109 do CP pela pena (em dias, 1 ano = 360). `fatoAntesDe2010` usa a redação anterior à Lei 12.234/2010. */
export function prazoArt109(penaDias: number, fatoAntesDe2010 = false): { anos: number; inciso: string; faixa: string } {
  const ano = 360;
  if (penaDias > 12 * ano) return { anos: 20, inciso: "I", faixa: "máximo superior a 12 anos" };
  if (penaDias > 8 * ano) return { anos: 16, inciso: "II", faixa: "superior a 8 e até 12 anos" };
  if (penaDias > 4 * ano) return { anos: 12, inciso: "III", faixa: "superior a 4 e até 8 anos" };
  if (penaDias > 2 * ano) return { anos: 8, inciso: "IV", faixa: "superior a 2 e até 4 anos" };
  if (penaDias >= ano) return { anos: 4, inciso: "V", faixa: "de 1 a 2 anos" };
  return fatoAntesDe2010 ? { anos: 2, inciso: "VI (redação anterior)", faixa: "inferior a 1 ano" } : { anos: 3, inciso: "VI", faixa: "inferior a 1 ano" };
}

export const TABELA_ART_109 = [
  { pena: "Superior a 12 anos", prazo: "20 anos", inciso: "I" },
  { pena: "Superior a 8 e até 12 anos", prazo: "16 anos", inciso: "II" },
  { pena: "Superior a 4 e até 8 anos", prazo: "12 anos", inciso: "III" },
  { pena: "Superior a 2 e até 4 anos", prazo: "8 anos", inciso: "IV" },
  { pena: "De 1 ano até 2 anos", prazo: "4 anos", inciso: "V" },
  { pena: "Inferior a 1 ano", prazo: "3 anos (2 anos para fatos até 05/05/2010)", inciso: "VI" },
];

export type ModoPenal = "abstrata" | "concreta" | "executoria";

export interface EntradaPenal {
  modo: ModoPenal;
  pena: Duracao;
  /** Data do fato ou do último marco interruptivo (CP, art. 117). */
  termoInicial: string;
  dataDoFato: string;
  /** Menor de 21 na data do fato ou maior de 70 na data da sentença (CP, art. 115). */
  reduzMetade: boolean;
  /** Só na pretensão executória: aumenta 1/3 (CP, art. 110, caput; Súmula 220 do STJ). */
  reincidente: boolean;
  soMulta: boolean;
}

export interface ResultadoPenal {
  prazoMeses: number;
  fim: string;
  prescrito: boolean;
  diasRestantes: number;
  linhas: Linha[];
  avisos: string[];
}

export function prescricaoPenal(e: EntradaPenal, hoje: string): ResultadoPenal {
  const avisos: string[] = [];
  const linhas: Linha[] = [];
  const antes2010 = e.dataDoFato < "2010-05-06";
  let meses: number;
  if (e.soMulta) {
    meses = 24;
    linhas.push({ rotulo: "Pena de multa isolada", valor: "2 anos", base: "CP, art. 114, I" });
  } else {
    const p = prazoArt109(emDias(e.pena), antes2010);
    meses = p.anos * 12;
    const rotuloPena = e.modo === "abstrata" ? "Pena máxima em abstrato" : "Pena aplicada";
    linhas.push({ rotulo: rotuloPena, valor: duracaoTexto(e.pena), base: e.modo === "abstrata" ? "CP, art. 109, caput" : "CP, art. 110" });
    linhas.push({ rotulo: "Prazo do art. 109", valor: `${p.anos} anos`, conta: p.faixa, base: `CP, art. 109, ${p.inciso}` });
  }
  if (e.modo === "executoria" && e.reincidente) {
    meses = (meses * 4) / 3;
    linhas.push({ rotulo: "Reincidência (+1/3)", valor: duracaoTexto({ anos: Math.floor(meses / 12), meses: Math.round(meses % 12), dias: 0 }), base: "CP, art. 110, caput" });
  }
  if (e.reduzMetade) {
    meses = meses / 2;
    linhas.push({ rotulo: "Redução pela metade (idade)", valor: duracaoTexto({ anos: Math.floor(meses / 12), meses: Math.round(meses % 12), dias: 0 }), base: "CP, art. 115" });
  }
  const mesesInteiros = Math.floor(meses);
  const diasExtras = Math.round((meses - mesesInteiros) * 30);
  // CP, art. 10: inclui o dia do começo, então termina na véspera do dia de igual número.
  const fim = somarDias(somarMeses(e.termoInicial, mesesInteiros, "seguinte"), diasExtras - 1);
  linhas.push({ rotulo: "Termo inicial", valor: dataBR(e.termoInicial), conta: "data do fato ou do último marco interruptivo", base: "CP, arts. 111 e 117" });
  linhas.push({ rotulo: "Prescreve em", valor: dataBR(fim), conta: "o dia do começo entra na contagem", base: "CP, art. 10", destaque: true });
  if (e.modo === "abstrata" && e.reincidente) avisos.push("A reincidência não aumenta o prazo da prescrição da pretensão punitiva (Súmula 220 do STJ).");
  if (e.modo === "concreta") avisos.push(antes2010 ? "Fato anterior à Lei 12.234/2010: a prescrição retroativa pode ter termo inicial anterior à denúncia ou queixa." : "Prescrição retroativa: não pode ter por termo inicial data anterior à denúncia ou queixa (CP, art. 110, § 1º, Lei 12.234/2010).");
  if (antes2010 && !e.soMulta && emDias(e.pena) < 360) avisos.push("Fato anterior a 06/05/2010: aplicado o prazo de 2 anos da redação anterior do art. 109, VI (lei mais benéfica).");
  avisos.push("Marcos interruptivos (art. 117): recebimento da denúncia, pronúncia, decisão confirmatória da pronúncia, sentença ou acórdão condenatórios recorríveis, início ou continuação do cumprimento da pena e reincidência. Após cada um, o prazo recomeça: informe a data do último como termo inicial. Confira também causas suspensivas (art. 116) e o art. 366 do CPP.");
  return { prazoMeses: meses, fim, prescrito: fim < hoje, diasRestantes: diasEntre(hoje, fim), linhas, avisos };
}
