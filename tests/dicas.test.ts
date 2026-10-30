import { test } from "node:test";
import assert from "node:assert/strict";
import { DICAS, dicaDaRota, dicaParaMostrar, ESTADO_INICIAL, lerEstado, posicionarBalao } from "../lib/dicas.ts";

const DESKTOP = { largura: 1440, altura: 900 };
const CELULAR = { largura: 390, altura: 844 };
const BALAO = { largura: 352, altura: 240 };

test("cada funcionalidade principal tem a sua dica", () => {
  for (const [rota, id] of [
    ["/", "painel"], ["/hoje", "hoje"], ["/intimacoes", "intimacoes"], ["/comunica", "comunica"], ["/processos", "processos"],
    ["/processos/central", "central"], ["/processos/revisao", "revisao"], ["/prazos", "prazos"], ["/biblioteca", "biblioteca"], ["/fluxos", "fluxos"],
  ]) assert.equal(dicaDaRota(rota)?.id, id, rota);
  assert.equal(new Set(DICAS.map((d) => d.id)).size, DICAS.length);
  for (const d of DICAS) assert.ok(d.titulo && d.texto.length > 20 && d.alvos.length, d.id);
});

test("a ficha de um processo tem dica; as telas irmãs e as subpáginas não confundem", () => {
  assert.equal(dicaDaRota("/processos/9b1d6c3e-0000-4000-8000-000000000000")?.id, "processo");
  assert.equal(dicaDaRota("/processos/novo"), undefined);
  assert.equal(dicaDaRota("/processos/protocolados"), undefined);
  assert.equal(dicaDaRota("/processos/abc/editar"), undefined);
  assert.equal(dicaDaRota("/intimacoes/123"), undefined);
  assert.equal(dicaDaRota("/conta"), undefined);
});

test("mostra uma vez por tela e nada quando desligadas", () => {
  assert.equal(dicaParaMostrar("/hoje", ESTADO_INICIAL)?.id, "hoje");
  assert.equal(dicaParaMostrar("/hoje", { ligadas: true, vistas: ["hoje"] }), undefined);
  assert.equal(dicaParaMostrar("/intimacoes", { ligadas: true, vistas: ["hoje"] })?.id, "intimacoes");
  assert.equal(dicaParaMostrar("/intimacoes", { ligadas: false, vistas: [] }), undefined);
});

test("estado guardado ausente ou corrompido volta ao inicial", () => {
  assert.deepEqual(lerEstado(null), ESTADO_INICIAL);
  assert.deepEqual(lerEstado("{quebrado"), ESTADO_INICIAL);
  assert.deepEqual(lerEstado('{"ligadas":false,"vistas":["hoje",3]}'), { ligadas: false, vistas: ["hoje"] });
});

test("sem alvo, o balão fica no centro", () => {
  const p = posicionarBalao(null, DESKTOP, BALAO);
  assert.equal(p.lado, "centro");
  assert.equal(p.left, (1440 - 352) / 2);
});

test("alvo estreito à esquerda: balão à direita", () => {
  const p = posicionarBalao({ top: 80, left: 260, width: 200, height: 60 }, DESKTOP, BALAO);
  assert.equal(p.lado, "direita");
  assert.equal(p.left, 472);
});

test("título da página no celular: balão abaixo, dentro da tela", () => {
  const p = posicionarBalao({ top: 70, left: 10, width: 370, height: 60 }, CELULAR, BALAO);
  assert.equal(p.lado, "abaixo");
  assert.ok(p.left >= 16 && p.left + BALAO.largura <= CELULAR.largura - 16 + 0.01);
});

test("alvo perto do rodapé: balão acima", () => {
  const p = posicionarBalao({ top: 760, left: 300, width: 40, height: 40 }, CELULAR, BALAO);
  assert.equal(p.lado, "acima");
  assert.ok(p.top >= 16);
});
