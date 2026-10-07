import { test } from "node:test";
import assert from "node:assert/strict";
import { dividirPeriodo, type ConsultaComunica, type IntimacaoImportada } from "../lib/comunica.ts";
import { buscarEmJanelas, ErroComunica, type BuscarPagina } from "../server/comunica/busca.ts";

const CONSULTA: ConsultaComunica = { termo: { tipo: "parte", valor: "Banco Bradesco S.A" }, dataInicio: "2026-09-01", dataFim: "2026-09-15" };
const OP = { diasPorJanela: 7, maxItens: 500, orcamentoMs: 60_000, esperar: async () => {} };

function item(data: string, n = 0): IntimacaoImportada {
  return { origem: "comunica", comunicaId: `${data}-${n}`, tribunal: "TJSP", orgao: "", dataDisponibilizacao: data, tipoComunicacao: "Intimação", meio: "D", tipoDocumento: "", classe: "", numeroProcesso: "", partes: [], advogados: [], texto: "" };
}

function timeout(): Error {
  const e = new Error("The operation was aborted due to timeout");
  e.name = "TimeoutError";
  return e;
}

test("divide o período em janelas, da mais recente para a mais antiga", () => {
  assert.deepEqual(dividirPeriodo("2026-09-01", "2026-09-15", 7), [
    { inicio: "2026-09-09", fim: "2026-09-15" },
    { inicio: "2026-09-02", fim: "2026-09-08" },
    { inicio: "2026-09-01", fim: "2026-09-01" },
  ]);
  assert.deepEqual(dividirPeriodo("2026-09-01", "2026-09-01", 7), [{ inicio: "2026-09-01", fim: "2026-09-01" }]);
  assert.equal(dividirPeriodo("2026-02-27", "2026-03-02", 1).length, 4, "atravessa o fim do mês");
});

test("junta as janelas e pagina dentro de cada uma", async () => {
  const chamadas: string[] = [];
  const buscar: BuscarPagina = async (c) => {
    chamadas.push(`${c.dataInicio}..${c.dataFim}#${c.pagina}`);
    if (c.dataFim === "2026-09-15") return { total: 150, itens: Array.from({ length: c.pagina === 1 ? 100 : 50 }, (_, i) => item(c.dataFim, i + (c.pagina! - 1) * 100)) };
    return { total: 1, itens: [item(c.dataFim)] };
  };
  const r = await buscarEmJanelas(CONSULTA, buscar, OP);
  assert.deepEqual(chamadas, ["2026-09-09..2026-09-15#1", "2026-09-09..2026-09-15#2", "2026-09-02..2026-09-08#1", "2026-09-01..2026-09-01#1"]);
  assert.equal(r.itens.length, 152);
  assert.equal(r.total, 152);
  assert.equal(r.truncado, false);
});

test("janela que estoura o tempo é refeita dia a dia", async () => {
  const buscar: BuscarPagina = async (c) => {
    if (c.dataInicio !== c.dataFim) throw timeout();
    return { total: 1, itens: [item(c.dataFim)] };
  };
  const r = await buscarEmJanelas(CONSULTA, buscar, OP);
  assert.equal(r.itens.length, 15);
  assert.equal(r.itens[0].dataDisponibilizacao, "2026-09-15");
  assert.equal(r.truncado, false);
});

test("se o tempo acabar, devolve o que já encontrou", async () => {
  let relogio = 0;
  const buscar: BuscarPagina = async (c) => {
    relogio += 25_000;
    return { total: 1, itens: [item(c.dataFim)] };
  };
  const r = await buscarEmJanelas(CONSULTA, buscar, { ...OP, diasPorJanela: 1, agora: () => relogio });
  assert.equal(r.itens.length, 3, "só três dias de 25s cabem em 60s");
  assert.ok(r.truncado);
  assert.match(r.aviso!, /lento/);
});

test("dia que falha depois de achar resultados vira aviso, não erro", async () => {
  const buscar: BuscarPagina = async (c) => {
    if (c.dataFim === "2026-09-15") return { total: 2, itens: [item(c.dataFim, 1), item(c.dataFim, 2)] };
    throw timeout();
  };
  const r = await buscarEmJanelas({ ...CONSULTA, dataInicio: "2026-09-14" }, buscar, { ...OP, diasPorJanela: 1 });
  assert.equal(r.itens.length, 2);
  assert.ok(r.truncado);
  assert.match(r.aviso!, /sobrecarregado/);
});

test("sem nenhum resultado, o timeout continua sendo erro", async () => {
  await assert.rejects(buscarEmJanelas(CONSULTA, async () => { throw timeout(); }, OP), { name: "TimeoutError" });
  await assert.rejects(buscarEmJanelas(CONSULTA, async () => { throw new ErroComunica("limite", 429); }, OP), ErroComunica);
});

test("respeita o máximo de itens", async () => {
  const buscar: BuscarPagina = async (c) => ({ total: 1000, itens: Array.from({ length: 100 }, (_, i) => item(c.dataFim, i + c.pagina! * 100)) });
  const r = await buscarEmJanelas(CONSULTA, buscar, { ...OP, maxItens: 250 });
  assert.equal(r.itens.length, 250);
  assert.ok(r.truncado);
});

function ocupado(): ErroComunica {
  return new ErroComunica("O sistema está muito ocupado", 503, true);
}

test("repete após esperar quando o Comunica diz que está ocupado", async () => {
  let chamadas = 0;
  const esperas: number[] = [];
  const buscar: BuscarPagina = async (c) => {
    chamadas++;
    if (chamadas <= 2) throw ocupado();
    return { total: 1, itens: [item(c.dataFim)] };
  };
  const r = await buscarEmJanelas({ ...CONSULTA, dataInicio: "2026-09-15" }, buscar, { ...OP, esperar: async (ms) => void esperas.push(ms) });
  assert.equal(r.itens.length, 1);
  assert.deepEqual(esperas, [3_000, 8_000]);
});

test("janela que continua ocupada é refeita dia a dia", async () => {
  const buscar: BuscarPagina = async (c) => {
    if (c.dataInicio !== c.dataFim) throw ocupado();
    return { total: 1, itens: [item(c.dataFim)] };
  };
  const r = await buscarEmJanelas(CONSULTA, buscar, OP);
  assert.equal(r.itens.length, 15);
  assert.equal(r.truncado, false);
});

test("ocupado até no dia a dia, sem resultados, vira erro claro", async () => {
  await assert.rejects(buscarEmJanelas(CONSULTA, async () => { throw ocupado(); }, OP), ErroComunica);
});

test("limite de requisições não multiplica as chamadas dividindo o período", async () => {
  let chamadas = 0;
  const limite = async () => {
    chamadas++;
    throw new ErroComunica("limite", 429, true);
  };
  await assert.rejects(buscarEmJanelas(CONSULTA, limite, OP), ErroComunica);
  assert.equal(chamadas, 3, "uma chamada e duas repetições");
});
