import { test } from "node:test";
import assert from "node:assert/strict";
import { filtrarIntimacoes, FILTROS_VAZIOS, ordenarIntimacoes } from "../lib/filtros.ts";
import { intimacoesParaCSV } from "../lib/csv.ts";
import { validarIntimacao } from "../lib/validacao.ts";
import type { Intimacao } from "../lib/types.ts";

function intimacao(over: Partial<Intimacao>): Intimacao {
  return {
    id: Math.random().toString(),
    origem: "manual",
    cliente: "Cliente A",
    tribunal: "TJSP",
    orgao: "1ª Vara",
    dataDisponibilizacao: "2026-09-10",
    tipoComunicacao: "Intimação",
    meio: "D",
    tipoDocumento: "Despacho",
    classe: "Procedimento Comum",
    numeroProcesso: "0000001-00.2026.8.26.0100",
    partes: [{ nome: "João da Silva", polo: "A" }],
    advogados: [],
    texto: "Intime-se a parte autora.",
    status: "nova",
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

const LISTA = [
  intimacao({ id: "1", dataDisponibilizacao: "2026-09-01", tipoComunicacao: "Citação" }),
  intimacao({ id: "2", dataDisponibilizacao: "2026-09-15", cliente: "Cliente B", status: "respondida" }),
  intimacao({ id: "3", dataDisponibilizacao: "2026-10-01", texto: "Prazo para contestação", partes: [{ nome: "Construção Ômega", polo: "P" }] }),
];

test("filtra por intervalo de datas", () => {
  const r = filtrarIntimacoes(LISTA, { ...FILTROS_VAZIOS, dataInicio: "2026-09-10", dataFim: "2026-09-30" });
  assert.deepEqual(r.map((i) => i.id), ["2"]);
});

test("filtra por categoria, status e cliente", () => {
  assert.deepEqual(filtrarIntimacoes(LISTA, { ...FILTROS_VAZIOS, tipoComunicacao: "Citação" }).map((i) => i.id), ["1"]);
  assert.deepEqual(filtrarIntimacoes(LISTA, { ...FILTROS_VAZIOS, status: "respondida" }).map((i) => i.id), ["2"]);
  assert.deepEqual(filtrarIntimacoes(LISTA, { ...FILTROS_VAZIOS, cliente: "Cliente B" }).map((i) => i.id), ["2"]);
});

test("busca livre ignora acentos e maiúsculas", () => {
  assert.deepEqual(filtrarIntimacoes(LISTA, { ...FILTROS_VAZIOS, busca: "construcao omega" }).map((i) => i.id), ["3"]);
  assert.deepEqual(filtrarIntimacoes(LISTA, { ...FILTROS_VAZIOS, busca: "CONTESTAÇÃO" }).map((i) => i.id), ["3"]);
});

test("ordena por data", () => {
  assert.deepEqual(ordenarIntimacoes(LISTA, "data_desc").map((i) => i.id), ["3", "2", "1"]);
  assert.deepEqual(ordenarIntimacoes(LISTA, "data_asc").map((i) => i.id), ["1", "2", "3"]);
});

test("gera CSV com separador ; e escapa aspas e quebras de linha", () => {
  const csv = intimacoesParaCSV([intimacao({ texto: 'Linha 1\nDiz "olá"; fim' })]);
  const [cabecalho] = csv.split("\r\n");
  assert.ok(cabecalho.startsWith("Data de disponibilização;Cliente;"));
  assert.ok(csv.includes('"Linha 1\nDiz ""olá""; fim"'));
  assert.ok(csv.includes("10/09/2026"));
});

test("valida o formulário de intimação", () => {
  const ok = {
    cliente: "A",
    tribunal: "TJSP",
    orgao: "1ª Vara",
    dataDisponibilizacao: "2026-10-01",
    tipoComunicacao: "Intimação",
    meio: "D",
    tipoDocumento: "",
    classe: "",
    numeroProcesso: "0000001-00.2026.8.26.0100",
    partes: [{ nome: "João", polo: "A" }],
    advogados: [{ nome: "", oab: "", uf: "" }],
    texto: "Intime-se a parte autora.",
    link: "",
    status: "nova" as const,
    prazo: "",
    observacoes: "",
  };
  assert.deepEqual(validarIntimacao(ok, "2026-10-06"), {});
  const e = validarIntimacao({ ...ok, numeroProcesso: "123", dataDisponibilizacao: "2026-12-01", texto: "curto", prazo: "2026-09-01", partes: [{ nome: "", polo: "A" }] }, "2026-10-06");
  assert.ok(e.numeroProcesso && e.dataDisponibilizacao && e.texto && e.partes);
  assert.ok(validarIntimacao({ ...ok, prazo: "2026-09-01" }, "2026-10-06").prazo);
  assert.ok(validarIntimacao({ ...ok, advogados: [{ nome: "Fulano", oab: "123", uf: "" }] }, "2026-10-06")["advogados.0"]);
});
