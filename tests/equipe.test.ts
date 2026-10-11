import { test } from "node:test";
import assert from "node:assert/strict";
import { delegar, iniciais, painelPorPessoa } from "../lib/equipe.ts";
import { filtrarIntimacoes, FILTROS_VAZIOS } from "../lib/filtros.ts";
import type { Intimacao, PessoaEquipe } from "../lib/types.ts";

function intimacao(over: Partial<Intimacao>): Intimacao {
  return {
    id: "i", origem: "manual", cliente: "Alfa", tribunal: "TJSP", orgao: "", dataDisponibilizacao: "2026-10-01", tipoComunicacao: "", meio: "",
    tipoDocumento: "", classe: "", numeroProcesso: "1", partes: [], advogados: [], texto: "", status: "nova", createdAt: "", updatedAt: "", ...over,
  };
}

const ana: PessoaEquipe = { id: "ana", nome: "Ana Souza" };
const bruno: PessoaEquipe = { id: "bruno", nome: "Bruno Lima" };
const carla: PessoaEquipe = { id: "carla", nome: "Carla Dias", inativa: true };

test("painel conta vencidas, urgentes e sem prazo por pessoa e põe o resto em 'sem responsável'", () => {
  // Hoje é sexta 09/10/2026; 12/10 é feriado. 3 dias úteis à frente = 15/10.
  const lista = [
    intimacao({ id: "a1", responsavelId: "ana", prazo: "2026-10-08" }),
    intimacao({ id: "a2", responsavelId: "ana", prazo: "2026-10-15" }),
    intimacao({ id: "a3", responsavelId: "ana", prazo: "2026-10-16" }),
    intimacao({ id: "a4", responsavelId: "ana" }),
    intimacao({ id: "a5", responsavelId: "ana", prazo: "2026-10-09", status: "respondida" }),
    intimacao({ id: "b1", responsavelId: "bruno", prazo: "2026-10-20" }),
    intimacao({ id: "x1", responsavelId: "apagado", prazo: "2026-10-20" }),
    intimacao({ id: "x2" }),
  ];
  const p = painelPorPessoa(lista, [ana, bruno, carla], "2026-10-09", []);
  assert.deepEqual(p.map((l) => l.pessoa?.id ?? null), ["ana", "bruno", null], "inativa sem nada some; quem tem vencida vem primeiro");
  assert.deepEqual({ ...p[0], pessoa: undefined, proximas: p[0].proximas.map((i) => i.id) }, { pessoa: undefined, abertas: 4, vencidas: 1, urgentes: 1, semPrazo: 1, proximas: ["a1", "a2", "a3"] });
  assert.equal(p[2].abertas, 2, "responsável apagado conta como sem responsável");
});

test("delegar troca, registra quando e tira o responsável", () => {
  const lista = [intimacao({ id: "1" }), intimacao({ id: "2", responsavelId: "ana", delegadaEm: "antes" })];
  const d = delegar(lista, ["1", "2"], "bruno", "agora");
  assert.deepEqual(d.map((i) => [i.responsavelId, i.delegadaEm]), [["bruno", "agora"], ["bruno", "agora"]]);
  assert.equal(delegar(d, ["1"], "bruno", "depois")[0].delegadaEm, "agora", "mesma pessoa não muda nada");
  const sem = delegar(d, ["2"], null, "depois")[1];
  assert.equal("responsavelId" in sem, false);
  assert.equal("delegadaEm" in sem, false);
});

test("filtro por responsável e iniciais", () => {
  const lista = [intimacao({ id: "1", responsavelId: "ana" }), intimacao({ id: "2" })];
  assert.deepEqual(filtrarIntimacoes(lista, { ...FILTROS_VAZIOS, responsavel: "ana" }).map((i) => i.id), ["1"]);
  assert.deepEqual(filtrarIntimacoes(lista, { ...FILTROS_VAZIOS, responsavel: "nenhum" }).map((i) => i.id), ["2"]);
  assert.equal(iniciais("Maria da Silva"), "MS");
  assert.equal(iniciais("Bruno"), "B");
});
