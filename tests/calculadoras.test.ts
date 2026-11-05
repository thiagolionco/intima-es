import { test } from "node:test";
import assert from "node:assert/strict";
import { anosCompletos, deDias, duracaoTexto, emDias, lerNumero, mesesEDias, somarMeses } from "../lib/calculadoras/base.ts";
import { calcularPorcentagem } from "../lib/calculadoras/porcentagem.ts";
import { avosDecimoTerceiro, avosFerias, calcularHorasExtras, calcularRescisao, calcularValorDaCausa, custasTrabalhistas, diasAvisoPrevio, referenciaDanoMoral, valorVincendas, type EntradaRescisao } from "../lib/calculadoras/trabalhista.ts";
import { HIPOTESES, prescricaoCivel, prescricaoPenal, prescricaoTrabalhista, prazoArt109 } from "../lib/calculadoras/prescricao.ts";
import { calcularDosimetria, type EntradaDosimetria } from "../lib/calculadoras/pena.ts";
import { honorariosFazenda, honorariosPercentual } from "../lib/calculadoras/honorarios.ts";
import { atualizar, cumprimentoDeSentenca } from "../lib/calculadoras/juros.ts";
import { custasJusticaFederal } from "../lib/calculadoras/custas.ts";
import { calcularExecucao } from "../lib/calculadoras/execucao-penal.ts";
import { calcularPrazo } from "../lib/prazos/calculo.ts";
import { Calendario } from "../lib/prazos/calendario.ts";

const hip = (id: string) => HIPOTESES.find((h) => h.id === id)!;
const valor = (r: { verbas: { id: string; valor: number }[] }, id: string) => r.verbas.find((v) => v.id === id)?.valor ?? 0;

test("lê números no formato brasileiro", () => {
  assert.equal(lerNumero("1.234,56"), 1234.56);
  assert.equal(lerNumero("R$ 3.000"), 3000);
  assert.equal(lerNumero("1234.5"), 1234.5);
  assert.equal(lerNumero("1.234.567"), 1234567);
  assert.equal(lerNumero("abc"), null);
  assert.equal(lerNumero(""), null);
});

test("datas: anos completos, meses e dias, fim de mês", () => {
  assert.equal(anosCompletos("2023-03-10", "2026-01-24"), 2);
  assert.equal(anosCompletos("2023-03-10", "2024-03-09"), 0);
  assert.equal(anosCompletos("2023-03-10", "2024-03-10"), 1);
  assert.deepEqual(mesesEDias("2025-03-10", "2026-01-24"), { meses: 10, dias: 15 });
  assert.equal(somarMeses("2020-02-29", 12, "seguinte"), "2021-03-01", "CC, art. 132, § 3º");
  assert.equal(somarMeses("2026-01-31", 1, "ultimo"), "2026-02-28");
  assert.equal(duracaoTexto(deDias(2750)), "7 anos, 7 meses e 20 dias");
  assert.equal(emDias({ anos: 5, meses: 6 }), 1980);
});

test("porcentagem", () => {
  assert.equal(calcularPorcentagem("parte", 15, 200)!.valor, 30);
  assert.equal(calcularPorcentagem("quantos", 30, 200)!.valor, 15);
  assert.equal(calcularPorcentagem("variacao", 100, 125)!.valor, 25);
  assert.equal(calcularPorcentagem("variacao", 200, 150)!.valor, -25);
  assert.equal(Math.round(calcularPorcentagem("original", 115, 15)!.valor * 100) / 100, 100);
  assert.equal(calcularPorcentagem("desconto", 80, 25)!.valor, 60);
  assert.equal(calcularPorcentagem("quantos", 1, 0), null);
});

test("aviso prévio proporcional (Lei 12.506/2011)", () => {
  assert.equal(diasAvisoPrevio("2025-01-01", "2025-12-31"), 30);
  assert.equal(diasAvisoPrevio("2025-01-01", "2026-01-01"), 33, "um ano completo já soma 3 dias");
  assert.equal(diasAvisoPrevio("2023-03-10", "2026-01-24"), 36);
  assert.equal(diasAvisoPrevio("2000-01-01", "2020-01-01"), 90);
  assert.equal(diasAvisoPrevio("1990-01-01", "2026-01-01"), 90, "teto de 90 dias");
});

test("avos de 13º e de férias (15 dias ou mais contam como mês)", () => {
  assert.equal(avosDecimoTerceiro("2020-01-01", "2026-03-14"), 2, "14 dias em março não contam");
  assert.equal(avosDecimoTerceiro("2020-01-01", "2026-03-15"), 3);
  assert.equal(avosDecimoTerceiro("2026-02-14", "2026-12-31"), 11, "admitido em 14/02: fevereiro tem 15 dias");
  assert.equal(avosFerias("2025-03-10", "2026-01-24"), 11);
  assert.equal(avosFerias("2025-03-10", "2026-01-23"), 10);
  assert.equal(avosFerias("2023-03-10", "2026-03-01"), 12);
});

const BASE: EntradaRescisao = {
  admissao: "2023-03-10",
  saida: "2026-01-24",
  remuneracao: 3000,
  modalidade: "sem_justa_causa",
  aviso: "indenizado",
  feriasVencidasSimples: 0,
  feriasVencidasDobro: 0,
  mesesSemFgts: 0,
  saldoFgts: 10000,
  multa477: false,
  multa467: false,
};

test("rescisão sem justa causa com aviso indenizado projetado", () => {
  const r = calcularRescisao(BASE);
  assert.equal(r.diasAviso, 36);
  assert.equal(r.saidaProjetada, "2026-03-01");
  assert.equal(valor(r, "saldo"), 2400);
  assert.equal(valor(r, "aviso"), 3600);
  assert.equal(r.avos13, 2);
  assert.equal(valor(r, "13"), 500);
  assert.equal(r.avosFerias, 12);
  assert.equal(valor(r, "ferias-prop"), 4000);
  assert.equal(valor(r, "fgts-rescisao"), 520);
  assert.equal(valor(r, "multa-fgts"), 4208, "40% de (10.000 + 520)");
  assert.equal(r.total, 15228);
});

test("rescisão por justa causa: sem aviso, sem proporcionais, sem multa do FGTS", () => {
  const r = calcularRescisao({ ...BASE, modalidade: "justa_causa", feriasVencidasSimples: 1 });
  assert.equal(valor(r, "aviso"), 0);
  assert.equal(valor(r, "13"), 0);
  assert.equal(valor(r, "ferias-prop"), 0);
  assert.equal(valor(r, "multa-fgts"), 0);
  assert.equal(valor(r, "ferias-vencidas"), 4000);
  assert.equal(r.total, 2400 + 4000 + 192);
});

test("pedido de demissão: proporcionais devidos (Súmula 261), sem aviso do empregador nem multa", () => {
  const r = calcularRescisao({ ...BASE, modalidade: "pedido_demissao" });
  assert.equal(r.saidaProjetada, BASE.saida);
  assert.equal(valor(r, "13"), 250);
  assert.equal(valor(r, "ferias-prop"), 3666.67);
  assert.equal(valor(r, "multa-fgts"), 0);
});

test("acordo do art. 484-A: metade do aviso e multa de 20%", () => {
  const r = calcularRescisao({ ...BASE, modalidade: "acordo" });
  assert.equal(valor(r, "aviso"), 1800);
  const base = 10000 + valor(r, "fgts-rescisao");
  assert.equal(valor(r, "multa-fgts"), Math.round(base * 0.2 * 100) / 100);
});

test("férias em dobro, multas dos arts. 467 e 477", () => {
  const r = calcularRescisao({ ...BASE, feriasVencidasDobro: 1, multa467: true, multa477: true });
  assert.equal(valor(r, "ferias-dobro"), 8000);
  assert.equal(valor(r, "multa-477"), 3000);
  const rescisorias = 2400 + 3600 + 500 + 8000 + 4000 + 4208;
  assert.equal(valor(r, "multa-467"), rescisorias / 2);
});

test("horas extras com reflexos", () => {
  const r = calcularHorasExtras({ remuneracao: 2200, divisor: 220, adicional: 50, horasPorMes: 20, meses: 12, reflexoDsr: 20, reflexos: true, multaFgts: false });
  const v = (id: string) => r.linhas.find((l) => l.id === id)!.valor;
  assert.equal(v("he"), 3600);
  assert.equal(v("dsr"), 720);
  assert.equal(v("r13"), 360);
  assert.equal(v("rferias"), 480);
  assert.equal(v("rfgts"), 412.8);
  assert.equal(r.total, 5572.8);
});

test("valor da causa, rito e custas trabalhistas", () => {
  const p = (valor: number) => [{ id: "1", descricao: "Pedido", valor }];
  assert.equal(calcularValorDaCausa(p(3242), { ano: 2026 }).rito, "sumario", "até 2 SM");
  assert.equal(calcularValorDaCausa(p(3242.01), { ano: 2026 }).rito, "sumarissimo");
  assert.equal(calcularValorDaCausa(p(64840), { ano: 2026 }).rito, "sumarissimo", "até 40 SM inclusive");
  assert.equal(calcularValorDaCausa(p(64840.01), { ano: 2026 }).rito, "ordinario");
  assert.equal(calcularValorDaCausa(p(30000), { ano: 2026, entePublico: true }).rito, "ordinario");
  const r = calcularValorDaCausa([...p(10000), { id: "2", descricao: "Dano moral", valor: 20000 }, { id: "3", descricao: "Sem valor", valor: 0 }], { ano: 2026 });
  assert.equal(r.total, 30000);
  assert.equal(r.custas.valor, 600);
  assert.equal(r.honorarios.min, 1500);
  assert.equal(r.honorarios.max, 4500);
  assert.equal(custasTrabalhistas(2_000_000, 2026).valor, 33902.2, "teto: 4 × R$ 8.475,55");
  assert.equal(custasTrabalhistas(100, 2026).valor, 10.64);
});

test("dano extrapatrimonial (art. 223-G) e vincendas (CPC, art. 292)", () => {
  assert.equal(referenciaDanoMoral("media", 3000).limite, 15000);
  assert.equal(referenciaDanoMoral("gravissima", 3000).limite, 150000);
  assert.equal(valorVincendas(1000, null).valor, 12000);
  assert.equal(valorVincendas(1000, 30).valor, 12000);
  assert.equal(valorVincendas(1000, 6).valor, 6000);
});

test("prescrição cível: dia de igual número, pandemia e dia sem expediente", () => {
  const hoje = "2026-11-05";
  assert.equal(prescricaoCivel(hip("reparacao"), "2021-03-15", hoje).fim, "2024-03-15");
  const pandemia = prescricaoCivel(hip("reparacao"), "2019-01-10", hoje);
  assert.equal(pandemia.diasSuspensos, 141);
  assert.equal(pandemia.fim, "2022-05-31");
  const domingo = prescricaoCivel(hip("geral"), "2016-11-15", hoje, { pandemia: false });
  assert.equal(domingo.fim, "2026-11-15");
  assert.equal(domingo.prorrogadoPara, "2026-11-16");
  assert.equal(prescricaoCivel(hip("seguro"), "2020-02-29", hoje, { pandemia: false }).fim, "2021-03-01");
  const fazenda = prescricaoCivel(hip("fazenda"), "2019-01-10", hoje);
  assert.equal(fazenda.diasSuspensos, 0, "Lei 14.010 é de direito privado");
  assert.equal(fazenda.fim, "2024-01-10");
});

test("prescrição trabalhista: bienal com aviso projetado e quinquenal do ajuizamento", () => {
  const r = prescricaoTrabalhista("2024-03-10", "2026-04-13", 33);
  assert.equal(r.limiteBienal, "2026-04-12");
  assert.equal(r.prorrogadoPara, "2026-04-13", "12/04/2026 é domingo");
  assert.equal(r.bienalOk, true);
  assert.equal(r.marcoQuinquenal, "2021-04-13");
  assert.equal(prescricaoTrabalhista("2024-03-10", "2026-04-14", 33).bienalOk, false);
  assert.equal(prescricaoTrabalhista(null, "2026-04-14").bienalOk, true);
});

test("prescrição penal: tabela do art. 109, art. 10, art. 115 e reincidência", () => {
  assert.equal(prazoArt109(emDias({ anos: 4 })).anos, 8);
  assert.equal(prazoArt109(emDias({ anos: 4, dias: 1 })).anos, 12);
  assert.equal(prazoArt109(emDias({ anos: 1 })).anos, 4);
  assert.equal(prazoArt109(emDias({ meses: 11 })).anos, 3);
  assert.equal(prazoArt109(emDias({ meses: 11 }), true).anos, 2);
  assert.equal(prazoArt109(emDias({ anos: 12, dias: 1 })).anos, 20);
  const base = { modo: "abstrata" as const, pena: { anos: 4, meses: 0, dias: 0 }, termoInicial: "2020-03-10", dataDoFato: "2020-03-10", reduzMetade: false, reincidente: false, soMulta: false };
  assert.equal(prescricaoPenal(base, "2026-11-05").fim, "2028-03-09", "inclui o dia do começo");
  assert.equal(prescricaoPenal({ ...base, reduzMetade: true }, "2026-11-05").fim, "2024-03-09");
  assert.equal(prescricaoPenal({ ...base, reincidente: true }, "2026-11-05").fim, "2028-03-09", "Súmula 220 do STJ");
  const exec = prescricaoPenal({ ...base, modo: "executoria", pena: { anos: 2, meses: 0, dias: 0 }, termoInicial: "2025-01-01", reincidente: true }, "2026-11-05");
  assert.equal(exec.fim, "2030-04-30", "4 anos + 1/3 = 5 anos e 4 meses");
  assert.equal(prescricaoPenal({ ...base, soMulta: true }, "2026-11-05").fim, "2022-03-09");
});

const ROUBO: EntradaDosimetria = {
  minimo: { anos: 4, meses: 0, dias: 0 },
  maximo: { anos: 10, meses: 0, dias: 0 },
  desfavoraveis: 2,
  criterio: "oitavo_intervalo",
  agravantes: 0,
  atenuantes: 1,
  fracaoSegundaFase: { num: 1, den: 6 },
  causas: [{ descricao: "Arma de fogo", tipo: "aumento", fracao: { num: 2, den: 3 } }],
  tipoPena: "reclusao",
  reincidente: false,
  reincidenteDoloso: false,
  violenciaOuGraveAmeaca: true,
  culposo: false,
  maiorDe70: false,
  reduzPrescricao: false,
};

test("dosimetria trifásica: roubo com arma de fogo", () => {
  const r = calcularDosimetria(ROUBO);
  assert.equal(duracaoTexto(r.penaBase), "5 anos e 6 meses");
  assert.equal(duracaoTexto(r.penaIntermediaria), "4 anos e 7 meses");
  assert.equal(duracaoTexto(r.penaDefinitiva), "7 anos, 7 meses e 20 dias");
  assert.equal(r.regime, "Semiaberto");
  assert.match(r.substituicao, /^Não cabe/);
  assert.match(r.sursis, /^Não cabe/);
  assert.equal(r.prescricao, "12 anos");
});

test("dosimetria: Súmula 231, tentativa e substituição", () => {
  const r = calcularDosimetria({
    ...ROUBO,
    minimo: { anos: 1, meses: 0, dias: 0 },
    maximo: { anos: 4, meses: 0, dias: 0 },
    desfavoraveis: 0,
    causas: [{ descricao: "Tentativa", tipo: "diminuicao", fracao: { num: 2, den: 3 } }],
    violenciaOuGraveAmeaca: false,
  });
  assert.equal(r.limitadaPelaSumula231, true);
  assert.equal(duracaoTexto(r.penaIntermediaria), "1 ano");
  assert.equal(duracaoTexto(r.penaDefinitiva), "4 meses");
  assert.equal(r.regime, "Aberto");
  assert.match(r.substituicao, /multa ou uma pena restritiva/);
  assert.equal(r.prescricao, "3 anos");
});

test("dosimetria: 1/6 do mínimo, agravante limitada ao máximo e regime do reincidente", () => {
  const r = calcularDosimetria({ ...ROUBO, criterio: "sexto_minimo", desfavoraveis: 8, agravantes: 3, atenuantes: 0, causas: [], reincidente: true });
  assert.equal(r.limitadaPeloMaximo, true);
  assert.equal(duracaoTexto(r.penaDefinitiva), "10 anos");
  assert.equal(r.regime, "Fechado");
});

test("honorários: faixas contra a Fazenda (art. 85, §§ 3º e 5º) e percentuais", () => {
  const r = honorariosFazenda(500 * 1621, 1621, 0);
  assert.equal(r.minimo, 71324);
  assert.equal(r.maximo, 113470);
  assert.equal(r.escolhido, 71324);
  assert.equal(honorariosFazenda(500 * 1621, 1621, 1).escolhido, 113470);
  assert.equal(honorariosPercentual(100000, 15, "cpc").escolhido, 15000);
  assert.equal(honorariosPercentual(100000, 25, "cpc").escolhido, 20000, "limitado a 20%");
  assert.equal(honorariosPercentual(100000, 3, "trabalhista").escolhido, 5000, "mínimo de 5%");
});

test("atualização com juros simples pro rata e cumprimento de sentença", () => {
  const r = atualizar({ principal: 10000, fator: 1.05, jurosMes: 1, jurosDe: "2025-01-01", jurosAte: "2025-07-01", jurosSobreCorrigido: true });
  assert.equal(r.corrigido, 10500);
  assert.equal(r.juros, 633.5);
  assert.equal(r.total, 11133.5);
  const c = cumprimentoDeSentenca(10000, 4000);
  assert.equal(c.multa, 600);
  assert.equal(c.honorarios, 600);
  assert.equal(c.total, 7200);
});

test("custas da Justiça Federal (Lei 9.289/1996)", () => {
  assert.equal(custasJusticaFederal(50000).total, 500);
  assert.equal(custasJusticaFederal(50000).inicial, 250);
  assert.equal(custasJusticaFederal(1_000_000).total, 1915.38);
  assert.equal(custasJusticaFederal(100).total, 10.64);
});

test("progressão de regime e livramento condicional", () => {
  const r = calcularExecucao({ pena: { anos: 6, meses: 0, dias: 0 }, dataBase: "2026-01-10", faixaProgressao: "16", livramento: "terco", diasRemidos: 0, diasDetracao: 0 });
  assert.equal(r.progressao.fracao, 345);
  assert.equal(r.progressao.data, "2026-12-25");
  assert.equal(r.livramento!.data, "2028-01-10");
  const comRemicao = calcularExecucao({ pena: { anos: 6, meses: 0, dias: 0 }, dataBase: "2026-01-10", faixaProgressao: "16", livramento: null, diasRemidos: 15, diasDetracao: 0 });
  assert.equal(comRemicao.progressao.data, "2026-12-10");
});

test("prazo contado da intimação (Súmula 310 do STF)", () => {
  const cal = new Calendario("TJPR");
  const sexta = calcularPrazo("2026-11-06", { dias: 5, contagem: "corridos", dobro: false }, cal, "intimacao")!;
  assert.equal(sexta.inicio, "2026-11-09");
  assert.equal(sexta.fim, "2026-11-13");
  const sabado = calcularPrazo("2026-11-07", { dias: 5, contagem: "uteis", dobro: false }, cal, "intimacao")!;
  assert.equal(sabado.publicacao, "2026-11-09");
  assert.equal(sabado.inicio, "2026-11-10");
  assert.equal(sabado.fim, "2026-11-16");
});
