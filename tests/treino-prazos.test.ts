import { strict as assert } from "node:assert";
import { test } from "node:test";
import { conferir, leituraValida, normalizarTexto } from "../lib/prazos/agente-prazos.ts";
import { comoConversa, dividir, gerar } from "../scripts/treino/gerar-exemplos-prazos.mts";
import { CASOS } from "./evals/agente-prazos.casos.ts";

test("treino: exemplos inventados passam no conferente, são repetíveis e não copiam as 28 avaliações", () => {
  const { exemplos } = gerar(300, 11);
  assert.equal(exemplos.length, 300);
  const proibidos = new Set(CASOS.map((c) => normalizarTexto(c.intimacao.texto ?? "")));
  for (const e of exemplos) {
    assert.ok(leituraValida(e.leitura), e.familia);
    assert.equal(conferir(e.dados, e.leitura, [], e.dados.dataDisponibilizacao).situacao, "confere", `${e.familia}: ${e.dados.texto}`);
    assert.ok(!proibidos.has(normalizarTexto(e.dados.texto ?? "")), "copiou uma avaliação");
  }
  assert.deepEqual(gerar(300, 11).exemplos.map((e) => e.dados.texto), exemplos.map((e) => e.dados.texto));
  assert.ok(exemplos.some((e) => e.leitura.dobro) && exemplos.some((e) => e.leitura.contagem === "corridos") && exemplos.some((e) => e.leitura.tarefa === "audiencia"));
});

test("treino: a conversa tem sistema, pergunta e a resposta em JSON; a divisão 80/10/10 não perde nem repete exemplo", () => {
  const { exemplos } = gerar(100, 3);
  const c = comoConversa(exemplos[0]);
  assert.deepEqual(c.messages.map((m) => m.role), ["system", "user", "assistant"]);
  assert.match(c.messages[1].content, /<documento titulo="Publicação">/);
  assert.equal(JSON.parse(c.messages[2].content).tarefa, exemplos[0].leitura.tarefa);
  const d = dividir(exemplos, 3);
  assert.deepEqual([d.treino.length, d.validacao.length, d.teste.length], [80, 10, 10]);
  assert.equal(new Set([...d.treino, ...d.validacao, ...d.teste]).size, 100);
});
