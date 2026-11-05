export interface ItemCatalogo {
  slug: string;
  titulo: string;
  descricao: string;
  area: "Trabalhista" | "Cível" | "Penal" | "Geral";
  base: string;
}

export const CALCULADORAS: ItemCatalogo[] = [
  { slug: "valor-da-causa-trabalhista", titulo: "Valor da causa trabalhista", descricao: "Verbas rescisórias, horas extras, dano extrapatrimonial e outros pedidos; soma, rito, custas e honorários.", area: "Trabalhista", base: "CLT, art. 840, § 1º; CPC, art. 292" },
  { slug: "prescricao", titulo: "Prazo prescricional", descricao: "Cível, consumidor, Fazenda Pública, tributário, trabalhista (bienal e quinquenal) e penal.", area: "Geral", base: "CC, arts. 205 e 206; CF, art. 7º, XXIX; CP, art. 109" },
  { slug: "dosimetria", titulo: "Dosimetria e atenuação da pena", descricao: "As três fases do art. 68, com atenuantes, agravantes, causas de aumento e diminuição, regime e substituição.", area: "Penal", base: "CP, arts. 59, 61 a 68, 33, 44 e 77" },
  { slug: "prazos", titulo: "Prazo processual", descricao: "Conta o vencimento em dias úteis ou corridos com os feriados e as suspensões do escritório.", area: "Geral", base: "CPC, arts. 219 e 224; CLT, art. 775; CPP, art. 798" },
  { slug: "porcentagem", titulo: "Porcentagem", descricao: "X% de um valor, quantos por cento, variação, acréscimo, desconto e valor antes do acréscimo.", area: "Geral", base: "" },
  { slug: "honorarios", titulo: "Honorários de sucumbência", descricao: "CPC (10% a 20%), faixas contra a Fazenda Pública e Justiça do Trabalho (5% a 15%).", area: "Cível", base: "CPC, art. 85; CLT, art. 791-A" },
  { slug: "atualizacao", titulo: "Atualização, juros e cumprimento", descricao: "Correção por fator, juros simples pro rata e multa e honorários de 10% do art. 523.", area: "Cível", base: "CC, arts. 389, 405 e 406; CPC, art. 523" },
  { slug: "custas", titulo: "Custas judiciais", descricao: "Justiça Federal (Lei 9.289/1996) e Justiça do Trabalho (CLT, art. 789).", area: "Geral", base: "Lei 9.289/1996; CLT, art. 789" },
  { slug: "execucao-penal", titulo: "Progressão e livramento", descricao: "Datas estimadas de progressão de regime e de livramento condicional, com remição e detração.", area: "Penal", base: "LEP, art. 112; CP, art. 83" },
];
