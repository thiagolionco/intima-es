import { test } from "node:test";
import assert from "node:assert/strict";
import { classificarAtuacao, referenciaAtuacao } from "../lib/atuacao.ts";
import { contarFiltrosAtivos, filtrarIntimacoes, FILTROS_VAZIOS } from "../lib/filtros.ts";
import type { Advogado, Intimacao, TermoMonitorado } from "../lib/types.ts";

function termo(over: Partial<TermoMonitorado>): TermoMonitorado {
  return { id: "t", apelido: "Eu", tipo: "oab", valor: "54321", ufOab: "PR", ativo: true, createdAt: "", ...over };
}

function intimacao(id: string, advogados: Advogado[]): Intimacao {
  return {
    id, origem: "comunica", cliente: "Eu", tribunal: "TJPR", orgao: "", dataDisponibilizacao: "2026-10-29", tipoComunicacao: "Intimação", meio: "",
    tipoDocumento: "", classe: "", numeroProcesso: id, partes: [], advogados, texto: "", status: "nova", createdAt: "", updatedAt: "",
  };
}

const eu: Advogado = { nome: "THIAGO LIONÇO", oab: "54321", uf: "PR" };
const barbara: Advogado = { nome: "BARBARA GIOVANA LIONÇO", oab: "60123", uf: "PR" };
const fora: Advogado = { nome: "CARLOS NAVARRO", oab: "48877", uf: "PR" };

const ref = referenciaAtuacao([termo({ atuacao: { souEu: true, colegas: [{ nome: "Barbara Giovana Lionço", oab: "60123", uf: "PR" }] } })]);

test("separa só eu, eu e colegas e atuação conjunta pelos advogados intimados", () => {
  assert.equal(classificarAtuacao(intimacao("1", [eu]), ref), "so_eu");
  assert.equal(classificarAtuacao(intimacao("2", [eu, barbara]), ref), "colegas");
  assert.equal(classificarAtuacao(intimacao("3", [eu, fora]), ref), "conjunta");
  assert.equal(classificarAtuacao(intimacao("4", [eu, barbara, fora]), ref), "conjunta");
});

test("intimação sem você fica fora das abas (só em Todos)", () => {
  assert.equal(classificarAtuacao(intimacao("5", [barbara]), ref), undefined);
  assert.equal(classificarAtuacao(intimacao("6", []), ref), undefined);
});

test("reconhece OAB com zeros à esquerda e sem UF, e advogado cadastrado por nome", () => {
  assert.equal(classificarAtuacao(intimacao("7", [{ nome: "T. L.", oab: "054321", uf: "" }]), ref), "so_eu");
  const porNome = referenciaAtuacao([termo({ tipo: "advogado", valor: "Thiago Lionço", ufOab: undefined, atuacao: { souEu: true, colegas: [] } })]);
  assert.equal(classificarAtuacao(intimacao("8", [{ nome: "thiago lionco", oab: "", uf: "" }]), porNome), "so_eu");
});

test("cliente marcado como colega conta como colega em todas as intimações", () => {
  const r = referenciaAtuacao([
    termo({ atuacao: { souEu: true, colegas: [] } }),
    termo({ id: "b", valor: "60123", atuacao: { souEu: false, colegas: [] } }),
  ]);
  assert.equal(classificarAtuacao(intimacao("9", [eu, barbara]), r), "colegas");
});

test("sem nenhum cliente marcado como 'Sou eu' não há separação", () => {
  assert.equal(referenciaAtuacao([termo({})]), null);
  assert.equal(referenciaAtuacao([termo({ atuacao: { souEu: false, colegas: [] } })]), null);
  assert.equal(classificarAtuacao(intimacao("1", [eu]), null), undefined);
});

test("filtro por atuação usa a referência e não conta como filtro do painel", () => {
  const lista = [intimacao("1", [eu]), intimacao("2", [eu, barbara]), intimacao("3", [eu, fora]), intimacao("4", [barbara])];
  assert.deepEqual(filtrarIntimacoes(lista, { ...FILTROS_VAZIOS, atuacao: "so_eu" }, ref).map((i) => i.id), ["1"]);
  assert.deepEqual(filtrarIntimacoes(lista, { ...FILTROS_VAZIOS, atuacao: "conjunta" }, ref).map((i) => i.id), ["3"]);
  assert.equal(filtrarIntimacoes(lista, FILTROS_VAZIOS, ref).length, 4);
  assert.equal(contarFiltrosAtivos({ ...FILTROS_VAZIOS, atuacao: "so_eu" }), 0);
});
