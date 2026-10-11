import { test } from "node:test";
import assert from "node:assert/strict";
import { mesclarImportadas } from "../lib/importacao.ts";
import { mesclarListas, semDuplicadas } from "../lib/sincronizacao.ts";
import type { IntimacaoImportada } from "../lib/comunica.ts";
import type { Intimacao } from "../lib/types.ts";

type R = { id: string; v: number };
const r = (id: string, v = 0): R => ({ id, v });

test("mescla três versões: o que mudou aqui vence, o que veio de lá é mantido", () => {
  const base = [r("a"), r("b"), r("c"), r("d")];
  const local = [r("novo-aqui"), r("a", 1), r("b"), r("d")]; // editou a, excluiu c
  const servidor = [r("novo-la"), r("a", 2), r("b", 2), r("c"), r("d")]; // ronda trouxe novo-la e mexeu em a e b
  assert.deepEqual(mesclarListas(base, local, servidor), [r("novo-aqui"), r("novo-la"), r("a", 1), r("b", 2), r("d")]);
});

test("registro excluído no servidor some mesmo que esteja na tela", () => {
  assert.deepEqual(mesclarListas([r("a"), r("b")], [r("a"), r("b")], [r("a")]), [r("a")]);
});

const importada = (over: Partial<IntimacaoImportada> = {}): IntimacaoImportada => ({
  origem: "comunica",
  comunicaId: "123",
  hash: "abc",
  tribunal: "TJSP",
  orgao: "5ª Vara Cível",
  dataDisponibilizacao: "2026-10-08",
  tipoComunicacao: "Intimação",
  meio: "D",
  tipoDocumento: "Despacho",
  classe: "Procedimento Comum Cível",
  numeroProcesso: "1000001-11.2026.8.26.0100",
  partes: [],
  advogados: [],
  texto: "Fica a ré intimada para, no prazo de 15 (quinze) dias, contestar.",
  ...over,
});

test("importação não duplica e já traz o prazo lido do texto", () => {
  let n = 0;
  const op = { suspensoes: [], agora: "2026-10-11T10:00:00.000Z", novoId: () => `id${++n}` };
  const r1 = mesclarImportadas([], [importada(), importada()], "Construtora Alfa", op);
  assert.equal(r1.novas.length, 1);
  assert.equal(r1.duplicadas, 1);
  assert.equal(r1.novas[0].prazo, "2026-11-03");
  assert.equal(r1.novas[0].regraPrazo?.fonte, "texto");
  const r2 = mesclarImportadas(r1.lista, [importada(), importada({ hash: "xyz", texto: "Ciência." })], "Construtora Alfa", op);
  assert.equal(r2.novas.length, 1);
  assert.equal(r2.novas[0].prazo, undefined);
  assert.equal(r2.lista.length, 2);
});

test("remove a mesma comunicação importada em dois lugares", () => {
  const a = { id: "1", origem: "comunica", hash: "h" } as Intimacao;
  const b = { id: "2", origem: "comunica", hash: "h" } as Intimacao;
  const m = { id: "3", origem: "manual", numeroProcesso: "x", dataDisponibilizacao: "", texto: "" } as unknown as Intimacao;
  assert.deepEqual(semDuplicadas([a, m, b]).map((i) => i.id), ["1", "3"]);
});
