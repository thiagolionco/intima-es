import { test } from "node:test";
import assert from "node:assert/strict";
import { gerarHtmlRelatorioCliente, gerarTextoRelatorioCliente, montarRelatorioCliente } from "../lib/relatorio-cliente.ts";
import type { Intimacao } from "../lib/types.ts";

function intimacao(over: Partial<Intimacao>): Intimacao {
  return {
    id: "i", origem: "comunica", cliente: "Construtora Alfa", tribunal: "TJSP", orgao: "5ª Vara Cível", dataDisponibilizacao: "2026-09-10", tipoComunicacao: "Intimação", meio: "D",
    tipoDocumento: "Despacho", classe: "", numeroProcesso: "1000001-11.2026.8.26.0100", partes: [], advogados: [], texto: "Intime-se a ré para contestar.", status: "nova", createdAt: "", updatedAt: "", ...over,
  };
}

const lista = [
  intimacao({ id: "a", status: "respondida", prazo: "2026-09-25", observacoes: "Protocolado em 20/09", responsavelId: "ana" }),
  intimacao({ id: "b", dataDisponibilizacao: "2026-09-28", numeroProcesso: "2", prazo: "2026-10-05", resumo: { texto: "Juiz marcou audiência.\nComparecer em 20/10.", em: "" } }),
  intimacao({ id: "c", dataDisponibilizacao: "2026-10-02", numeroProcesso: "3", prazo: "2026-10-20" }),
  intimacao({ id: "d", cliente: "Outro", prazo: "2026-10-15" }),
];
const op = { cliente: "Construtora Alfa", inicio: "2026-09-01", fim: "2026-09-30", hoje: "2026-10-11", equipe: [{ id: "ana", nome: "Ana Souza" }] };

test("junta o período, os prazos vencidos e os próximos, só do cliente", () => {
  const r = montarRelatorioCliente(lista, op);
  assert.deepEqual(r.totais, { recebidas: 2, processos: 2, respondidas: 1, emAberto: 1, vencidas: 1 });
  assert.deepEqual(r.linhas.map((l) => l.situacao), ["Providência tomada", "Recebida"]);
  assert.equal(r.linhas[1].descricao, "Juiz marcou audiência.\nComparecer em 20/10.", "usa o resumo quando há");
  assert.deepEqual(r.vencidos.map((p) => p.processo), ["2"]);
  assert.deepEqual(r.proximosPrazos.map((p) => p.processo), ["3"], "prazo de outra competência também entra; o de outro cliente não");
});

test("observações e responsável só entram quando pedidos, e o HTML escapa o conteúdo", () => {
  const sem = montarRelatorioCliente(lista, op);
  assert.equal(sem.linhas[0].observacoes, undefined);
  assert.equal(sem.linhas[0].responsavel, undefined);
  const com = montarRelatorioCliente(lista, { ...op, incluirObservacoes: true, incluirResponsavel: true });
  assert.equal(com.linhas[0].observacoes, "Protocolado em 20/09");
  assert.equal(com.linhas[0].responsavel, "Ana Souza");

  const h = gerarHtmlRelatorioCliente(montarRelatorioCliente([intimacao({ cliente: "<script>x</script>" })], { ...op, cliente: "<script>x</script>" }), { geradoEm: "agora" });
  assert.doesNotMatch(h, /<script>x<\/script>/);
  assert.match(h, /&lt;script&gt;/);
  assert.match(gerarHtmlRelatorioCliente(sem, { geradoEm: "agora", escritorio: "Lionço Advocacia" }), /Lionço Advocacia/);
});

test("texto para e-mail", () => {
  const t = gerarTextoRelatorioCliente(montarRelatorioCliente(lista, op));
  assert.match(t, /Construtora Alfa · 01\/09\/2026 a 30\/09\/2026/);
  assert.match(t, /2 intimação\(ões\) em 2 processo\(s\): 1 com providência tomada e 1 em andamento/);
  assert.match(t, /- 20\/10\/2026: processo 3/);
});
