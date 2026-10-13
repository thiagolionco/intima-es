import { test } from "node:test";
import assert from "node:assert/strict";
import { abasPorCliente, contarUrgentes, filaDeHoje, FILTROS_HOJE, urgencia } from "../lib/hoje.ts";
import type { Intimacao } from "../lib/types.ts";

const HOJE = "2026-10-13";

let n = 0;
function intimacao(over: Partial<Intimacao>): Intimacao {
  return {
    id: `i${++n}`,
    origem: "comunica",
    cliente: "Construtora Alfa",
    tribunal: "TJSP",
    orgao: "1ª Vara",
    dataDisponibilizacao: "2026-10-01",
    tipoComunicacao: "Intimação",
    meio: "D",
    tipoDocumento: "Despacho",
    classe: "Procedimento Comum",
    numeroProcesso: `000000${n}-00.2026.8.26.0100`,
    partes: [{ nome: "João da Silva", polo: "A" }],
    advogados: [],
    texto: "Intime-se.",
    status: "nova",
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

test("selo de urgência: texto para cada situação", () => {
  assert.deepEqual(urgencia("2026-10-03", HOJE), { dias: -10, nivel: "vencido", texto: "Vencido há 10 dias" });
  assert.equal(urgencia("2026-10-12", HOJE).texto, "Vencido há 1 dia");
  assert.equal(urgencia("2026-10-13", HOJE).texto, "Vence hoje");
  assert.deepEqual(urgencia("2026-10-14", HOJE), { dias: 1, nivel: "amanha", texto: "Vence amanhã" });
  assert.equal(urgencia("2026-10-18", HOJE).nivel, "semana");
  assert.equal(urgencia("2026-10-30", HOJE).texto, "Vence em 17 dias");
  assert.equal(urgencia("2026-10-30", HOJE).nivel, "depois");
});

const lista = [
  intimacao({ id: "amanha", prazo: "2026-10-14" }),
  intimacao({ id: "sem-prazo" }),
  intimacao({ id: "vencida", prazo: "2026-10-03", cliente: "Dra. Ana", responsavelId: "p1", partes: [{ nome: "Município de São José", polo: "P" }] }),
  intimacao({ id: "respondida", prazo: "2026-10-01", status: "respondida" }),
  intimacao({ id: "hoje", prazo: "2026-10-13", status: "em_analise", cliente: "Dra. Ana" }),
  intimacao({ id: "longe", prazo: "2026-11-20", responsavelId: "p2" }),
];
const ids = (r: { intimacao: Intimacao }[]) => r.map((x) => x.intimacao.id);

test("fila: só com prazo e abertas, da mais urgente para a menos", () => {
  assert.deepEqual(ids(filaDeHoje(lista, FILTROS_HOJE, HOJE)), ["vencida", "hoje", "amanha", "longe"]);
});

test("fila: filtros de status, cliente e responsável", () => {
  assert.deepEqual(ids(filaDeHoje(lista, { ...FILTROS_HOJE, status: "todas" }, HOJE)), ["respondida", "vencida", "hoje", "amanha", "longe"]);
  assert.deepEqual(ids(filaDeHoje(lista, { ...FILTROS_HOJE, status: "em_analise" }, HOJE)), ["hoje"]);
  assert.deepEqual(ids(filaDeHoje(lista, { ...FILTROS_HOJE, cliente: "Dra. Ana" }, HOJE)), ["vencida", "hoje"]);
  assert.deepEqual(ids(filaDeHoje(lista, { ...FILTROS_HOJE, responsavel: "p2" }, HOJE)), ["longe"]);
  assert.deepEqual(ids(filaDeHoje(lista, { ...FILTROS_HOJE, responsavel: "nenhum" }, HOJE)), ["hoje", "amanha"]);
});

test("fila: busca sem acento e sem diferenciar maiúsculas", () => {
  assert.deepEqual(ids(filaDeHoje(lista, { ...FILTROS_HOJE, busca: "municipio sao jose" }, HOJE)), ["vencida"]);
  assert.deepEqual(ids(filaDeHoje(lista, { ...FILTROS_HOJE, busca: "MUNICÍPIO" }, HOJE)), ["vencida"]);
  assert.deepEqual(ids(filaDeHoje(lista, { ...FILTROS_HOJE, busca: "inexistente" }, HOJE)), []);
});

test("abas por cliente: contam com os outros filtros e mantêm os monitorados", () => {
  assert.deepEqual(abasPorCliente(lista, FILTROS_HOJE, HOJE, ["Banco Beta"]), [
    { cliente: "Dra. Ana", total: 2, urgentes: 2 },
    { cliente: "Construtora Alfa", total: 2, urgentes: 0 },
    { cliente: "Banco Beta", total: 0, urgentes: 0 },
  ]);
  const comBusca = abasPorCliente(lista, { ...FILTROS_HOJE, busca: "municipio", cliente: "Construtora Alfa" }, HOJE);
  assert.deepEqual(comBusca, [{ cliente: "Dra. Ana", total: 1, urgentes: 1 }], "a aba escolhida não esconde as outras");
});

test("contador do menu: abertas vencidas ou vencendo hoje", () => {
  assert.equal(contarUrgentes(lista, HOJE), 2);
});
