import { test } from "node:test";
import assert from "node:assert/strict";
import { sugerirTarefa, TIPOS_TAREFA, type DadosTarefa } from "../lib/tarefas.ts";

const base: DadosTarefa = { texto: "", tipoDocumento: "Despacho", tipoComunicacao: "Intimação", tribunal: "TJSP", classe: "Procedimento Comum Cível", orgao: "1ª Vara Cível" };
const tarefa = (texto: string, extra: Partial<DadosTarefa> = {}) => sugerirTarefa({ ...base, ...extra, texto });

test("réplica: manifestação sobre a contestação vence a palavra 'contestação'", () => {
  const r = tarefa("Vistos. Manifeste-se a parte autora sobre a contestação e documentos, no prazo de 15 (quinze) dias.");
  assert.equal(r.tipo, "replica");
  assert.deepEqual(r.prazoLegal, { dias: 15, base: "CPC, arts. 350 e 351" });
  assert.match(r.trecho!, /sobre a contestação/, "o trecho mantém os acentos do original");
});

test("contestar: citação pelo texto ou pelo tipo de comunicação", () => {
  assert.equal(tarefa("Cite-se a parte ré para, querendo, apresentar contestação no prazo legal.").tipo, "contestar");
  assert.equal(tarefa("Fica a parte requerida ciente do inteiro teor.", { tipoComunicacao: "Citação" }).tipo, "contestar");
});

test("audiência: lê data e hora e ignora audiência já realizada", () => {
  const r = tarefa("Designo audiência de conciliação para o dia 12/11/2026, às 14h30, a realizar-se por videoconferência.");
  assert.equal(r.tipo, "audiencia");
  assert.equal(r.data, "2026-11-12");
  assert.equal(r.hora, "14:30");
  assert.equal(r.prazoLegal, undefined);

  const realizada = tarefa("Realizada a audiência de conciliação, as partes não chegaram a acordo. Especifiquem as partes as provas que pretendem produzir.");
  assert.equal(realizada.tipo, "especificar_provas");
});

test("sentença e acórdão pedem avaliar recurso, mesmo com 'arquivem-se' no fim", () => {
  const s = tarefa("Ante o exposto, JULGO PROCEDENTE o pedido. P.R.I. Após o trânsito em julgado, arquivem-se.", { tipoDocumento: "Sentença" });
  assert.equal(s.tipo, "avaliar_recurso");
  assert.ok(!s.outras.includes("ciencia"));
  assert.equal(tarefa("Acordam os Desembargadores, por unanimidade, em negar provimento ao recurso.").tipo, "avaliar_recurso");
  assert.equal(tarefa("Texto sem pistas.", { tipoDocumento: "Sentença" }).tipo, "avaliar_recurso");
});

test("contrarrazões, emenda, pagamento, perícia, custas", () => {
  assert.equal(tarefa("Intime-se o apelado para apresentar contrarrazões.").tipo, "contrarrazoar");
  assert.equal(tarefa("Emende o autor a petição inicial, sob pena de indeferimento.").tipo, "emendar");
  assert.equal(tarefa("Intime-se o executado para pagar o débito, nos termos do art. 523 do CPC.").tipo, "pagar");
  assert.equal(tarefa("Nomeio perito o Sr. Fulano. Faculto às partes a apresentação de quesitos e assistentes técnicos.").tipo, "pericia");
  assert.equal(tarefa("Intime-se a executada para pagamento em 48 horas, sob pena de penhora.", { tribunal: "TRT15" }).tipo, "pagar");
  assert.equal(tarefa("Recolha o autor as custas iniciais, sob pena de cancelamento da distribuição.").tipo, "custas");
});

test("manifestação genérica, ciência e análise", () => {
  const m = tarefa("Dê-se vista às partes do ofício juntado.");
  assert.equal(m.tipo, "manifestar");
  assert.equal(m.prazoLegal?.dias, 5);
  assert.equal(tarefa("Remetam-se os autos ao Tribunal de Justiça.").tipo, "ciencia");
  const nada = tarefa("Lorem ipsum.");
  assert.equal(nada.tipo, "analisar");
  assert.equal(nada.trecho, undefined);
});

test("Justiça do Trabalho e penal não recebem o prazo do CPC", () => {
  assert.equal(tarefa("Manifeste-se o reclamante sobre a contestação.", { tribunal: "TRT2" }).prazoLegal, undefined);
  assert.equal(tarefa("Cite-se o réu.", { classe: "Ação Penal - Procedimento Ordinário" }).prazoLegal, undefined);
});

test("usa o resumo automático quando o texto é vago", () => {
  const r = sugerirTarefa({ ...base, texto: "Vide documento anexo.", resumo: { texto: "Juiz recebeu a apelação.\nApresentar contrarrazões em 15 dias.", em: "2026-10-01T00:00:00Z" } });
  assert.equal(r.tipo, "contrarrazoar");
});

test("lista outras providências pedidas no mesmo texto", () => {
  const r = tarefa("Manifeste-se o autor sobre a contestação e especifiquem as partes as provas que pretendem produzir.");
  assert.equal(r.tipo, "replica");
  assert.ok(r.outras.includes("especificar_provas"));
});

test("todos os tipos têm rótulo único", () => {
  const rotulos = TIPOS_TAREFA.map((t) => t.rotulo);
  assert.equal(new Set(rotulos).size, rotulos.length);
});
