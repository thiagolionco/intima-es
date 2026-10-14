import { test } from "node:test";
import assert from "node:assert/strict";
import type { ResumoCobertura } from "../lib/cobertura.ts";
import { notificacoes } from "../lib/notificacoes.ts";
import type { Intimacao } from "../lib/types.ts";

const AGORA = new Date("2026-10-11T15:00:00Z");
const HOJE = "2026-10-11";
const i = (id: string, prazo: string | undefined, status: Intimacao["status"] = "nova") => ({ id, prazo, status }) as Intimacao;

test("sem nada pendente, o sino fica vazio", () => {
  assert.deepEqual(notificacoes([], undefined, HOJE, AGORA), []);
});

test("conta prazos vencidos, de hoje e de amanhã só entre as abertas", () => {
  const lista = [i("a", "2026-10-09"), i("b", "2026-10-11", "em_analise"), i("c", "2026-10-12"), i("d", "2026-10-09", "respondida"), i("e", "2026-10-20")];
  const n = notificacoes(lista, undefined, HOJE, AGORA);
  assert.deepEqual(n.map((x) => x.id), ["vencidos", "hoje", "amanha", "novas"]);
  assert.equal(n[0].titulo, "1 prazo vencido");
  assert.equal(n[3].titulo, "3 intimações novas");
});

test("vigília parada entra primeiro, como alerta", () => {
  const cobertura: ResumoCobertura = { rondaLigada: true, intervaloHoras: 6, termos: 1, ultimaRonda: "2026-10-10T00:00:00Z", lacunas: [] };
  const n = notificacoes([], cobertura, HOJE, AGORA);
  assert.equal(n.length, 1);
  assert.equal(n[0].id, "vigilia");
  assert.equal(n[0].tom, "alerta");
});

test("vigília em dia não gera aviso", () => {
  const cobertura: ResumoCobertura = { rondaLigada: true, intervaloHoras: 6, termos: 1, ultimaRonda: "2026-10-11T14:00:00Z", lacunas: [] };
  assert.deepEqual(notificacoes([], cobertura, HOJE, AGORA), []);
});
