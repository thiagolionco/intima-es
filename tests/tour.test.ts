import { test } from "node:test";
import assert from "node:assert/strict";
import { chaveTourVisto, PASSOS_TOUR, posicionarBalao } from "../lib/tour.ts";

const DESKTOP = { largura: 1440, altura: 900 };
const CELULAR = { largura: 390, altura: 844 };
const BALAO = { largura: 352, altura: 240 };

test("o tour passa pelas telas principais e termina na Ajuda", () => {
  const rotas = PASSOS_TOUR.map((p) => p.rota).filter(Boolean);
  for (const r of ["/hoje", "/intimacoes", "/comunica", "/processos", "/processos/central", "/prazos", "/biblioteca", "/fluxos"]) assert.ok(rotas.includes(r), r);
  assert.equal(PASSOS_TOUR.at(-1)?.id, "ajuda");
  assert.equal(new Set(PASSOS_TOUR.map((p) => p.id)).size, PASSOS_TOUR.length);
  for (const p of PASSOS_TOUR) assert.ok(p.titulo && p.texto.length > 20, p.id);
});

test("a chave de visto é por conta e por versão", () => {
  assert.notEqual(chaveTourVisto("a"), chaveTourVisto("b"));
  assert.match(chaveTourVisto("a"), /^clepsa:tour:v\d+:a$/);
});

test("sem alvo, o balão fica no centro", () => {
  const p = posicionarBalao(null, DESKTOP, BALAO);
  assert.equal(p.lado, "centro");
  assert.equal(p.left, (1440 - 352) / 2);
});

test("alvo na barra lateral: balão à direita", () => {
  const p = posicionarBalao({ top: 80, left: 10, width: 240, height: 500 }, DESKTOP, BALAO);
  assert.equal(p.lado, "direita");
  assert.equal(p.left, 262);
});

test("título da página: balão abaixo, dentro da tela", () => {
  const p = posicionarBalao({ top: 70, left: 10, width: 370, height: 60 }, CELULAR, BALAO);
  assert.equal(p.lado, "abaixo");
  assert.ok(p.left >= 16 && p.left + BALAO.largura <= CELULAR.largura - 16 + 0.01);
});

test("alvo perto do rodapé: balão acima", () => {
  const p = posicionarBalao({ top: 760, left: 300, width: 40, height: 40 }, CELULAR, BALAO);
  assert.equal(p.lado, "acima");
  assert.ok(p.top >= 16);
});

test("botão no canto direito do celular: o balão não sai da tela", () => {
  const p = posicionarBalao({ top: 8, left: 340, width: 40, height: 40 }, CELULAR, BALAO);
  assert.equal(p.lado, "abaixo");
  assert.equal(p.left, 390 - 352 - 16);
});
