import { test } from "node:test";
import assert from "node:assert/strict";
import { chaveDiaOficial, descricaoDoDia, jaCadastrados, limparDiasOficiais, soOQueAcrescenta } from "../lib/prazos/calendario-oficial.ts";
import { dominioTribunal, fontesDoTribunal } from "../lib/prazos/tribunais.ts";
import { AppError } from "../server/core/errors.ts";
import type { PedidoIa, RespostaIa, ServicoIa } from "../server/ia/ia.ts";
import { CalendarioOficialService, htmlParaTexto, type Baixar } from "../server/prazos/calendario-oficial.ts";

const relogio = { agora: () => new Date("2026-10-30T12:00:00Z") };
const erro = (codigo: string) => (e: unknown) => e instanceof AppError && e.codigo === codigo;

/** IA de mentira: devolve a próxima resposta da fila e guarda os pedidos. */
class IaFalsa implements ServicoIa {
  readonly modelo = "falso";
  pedidos: PedidoIa[] = [];
  private readonly respostas: (object | Error)[];
  private readonly fontes: string[];
  constructor(respostas: (object | Error)[], fontes: string[] = []) {
    this.respostas = respostas;
    this.fontes = fontes;
  }
  async perguntar(p: PedidoIa): Promise<RespostaIa> {
    this.pedidos.push(p);
    const r = this.respostas.shift() ?? { encontrado: false, dias: [] };
    if (r instanceof Error) throw r;
    return { texto: JSON.stringify(r), fontesWeb: this.fontes.map((url) => ({ titulo: url, url })), modelo: "teste" };
  }
}

const dia = (inicio: string, descricao: string, extra: Record<string, string> = {}) => ({ inicio, fim: inicio, descricao, abrangencia: "estadual", local: "", base: "", ...extra });

test("lê a tabela do TRT9 como texto, uma linha por dia", () => {
  const html = `<html><head><style>td{}</style></head><body><script>var x=1</script><table>
    <tr><th>Data</th><th>Descrição</th><th>Abrangência</th></tr>
    <tr><td>14/08/2026</td><td>Transferência do feriado de 11/8 (Instituição dos Cursos Jurídicos)</td><td>Estadual</td></tr>
    <tr><td>15/08/2026</td><td>Padroeira do município de Maringá</td><td>Municipal</td></tr></table>&nbsp;Portaria n&ordm; 1&#47;2025</body></html>`;
  const t = htmlParaTexto(html);
  assert.match(t, /14\/08\/2026 \| Transferência do feriado de 11\/8 \(Instituição dos Cursos Jurídicos\) \| Estadual/);
  assert.match(t, /\n15\/08\/2026 \| Padroeira/);
  assert.match(t, /Portaria nº 1\/2025/);
  assert.ok(!t.includes("var x") && !t.includes("td{}"));
});

test("confere o que a IA leu: datas válidas, ano pedido, sem repetição", () => {
  const dias = limparDiasOficiais(
    [
      dia("2026-08-14", "Transferência do feriado de 11/8"),
      dia("2026-08-14", "Transferência do feriado de 11/8"),
      dia("2026-02-30", "Data impossível"),
      dia("2027-01-05", "Outro ano"),
      { ...dia("2026-12-20", "Recesso"), fim: "2027-01-06" },
      dia("2026-08-15", "Padroeira", { abrangencia: "municipal", local: "Maringá" }),
      dia("2026-09-01", "Local em abrangência estadual some", { local: "Curitiba" }),
      dia("2026-06-01", ""),
      { ...dia("2026-06-05", "Abrangência desconhecida"), abrangencia: "galáctica" },
      "lixo",
    ],
    2026,
  );
  assert.deepEqual(
    dias.map((d) => [d.inicio, d.fim, d.abrangencia, d.local ?? ""]),
    [
      ["2026-06-05", "2026-06-05", "estadual", ""],
      ["2026-08-14", "2026-08-14", "estadual", ""],
      ["2026-08-15", "2026-08-15", "municipal", "Maringá"],
      ["2026-09-01", "2026-09-01", "estadual", ""],
      ["2026-12-20", "2026-12-31", "estadual", ""],
    ],
  );
  assert.deepEqual(limparDiasOficiais("nada", 2026), []);
});

test("mostra só o que o tribunal acrescenta aos nacionais, fins de semana e recesso", () => {
  const dias = limparDiasOficiais(
    [
      dia("2026-11-02", "Finados", { abrangencia: "nacional" }),
      dia("2026-08-15", "Sábado em Maringá", { abrangencia: "municipal", local: "Maringá" }),
      dia("2026-12-21", "Recesso"),
      dia("2026-08-14", "Transferência do feriado de 11/8"),
      { ...dia("2026-04-01", "Semana Santa"), fim: "2026-04-03" },
    ],
    2026,
  );
  assert.deepEqual(
    soOQueAcrescenta(dias, "TRT9").map((d) => d.descricao),
    ["Semana Santa", "Transferência do feriado de 11/8"],
  );
  // Na Justiça Federal, quarta e quinta da Semana Santa já contam (Lei 5.010): o período inteiro já está coberto.
  assert.deepEqual(
    soOQueAcrescenta(dias, "TRF4").map((d) => d.descricao),
    ["Transferência do feriado de 11/8"],
  );
});

test("sabe o que já foi levado para o cálculo", () => {
  const [d] = limparDiasOficiais([dia("2026-06-12", "Aniversário de Londrina", { abrangencia: "municipal", local: "Londrina" })], 2026);
  assert.equal(descricaoDoDia(d), "Aniversário de Londrina (Londrina)");
  const susp = [{ id: "1", inicio: "2026-06-12", fim: "2026-06-12", descricao: "Aniversário de Londrina (Londrina)", tribunal: "TJPR" }];
  assert.deepEqual([...jaCadastrados([d], susp, "TJPR")], [chaveDiaOficial(d)]);
  assert.equal(jaCadastrados([d], susp, "TRT9").size, 0);
});

test("fontes e domínio de cada tribunal", () => {
  assert.equal(fontesDoTribunal("trt-9")[0], "https://www.trt9.jus.br/institucional/calendario.xhtml");
  assert.equal(fontesDoTribunal("TJPR").length, 2);
  assert.deepEqual(fontesDoTribunal("TJGO"), []);
  assert.equal(dominioTribunal("TJGO"), "tjgo.jus.br");
  assert.equal(dominioTribunal("XYZ"), undefined);
});

test("lê o calendário pelas fontes do tribunal (página e PDF)", async () => {
  const baixados: string[] = [];
  const baixar: Baixar = async (url) => {
    baixados.push(url);
    return url.endsWith("decreto") ? { tipo: "pdf", bytes: new Uint8Array([37, 80, 68, 70]) } : { tipo: "texto", texto: "18/12/2026 | Transferência do Dia da Justiça" };
  };
  const ia = new IaFalsa([{ encontrado: true, dias: [dia("2026-12-18", "Dia da Justiça (transferido de 08/12)")] }]);
  const s = new CalendarioOficialService({ ia, baixar, clock: relogio });
  const c = await s.ler("u1", "tjpr", 2026);
  assert.equal(c.tribunal, "TJPR");
  assert.deepEqual(c.dias.map((d) => d.inicio), ["2026-12-18"]);
  assert.deepEqual(c.fontes, fontesDoTribunal("TJPR"));
  assert.equal(baixados.length, 2);
  assert.deepEqual(ia.pedidos[0].blocos.map((b) => b.tipo), ["documento", "pdf", "texto"]);
  assert.equal(ia.pedidos[0].pesquisaWeb, undefined);
});

test("sem fonte que abra, pesquisa só no site do tribunal", async () => {
  const ia = new IaFalsa([{ encontrado: true, dias: [dia("2026-06-04", "Corpus Christi")] }], ["https://www.tjgo.jus.br/feriados-2026"]);
  const s = new CalendarioOficialService({ ia, baixar: async () => null, clock: relogio });
  const c = await s.ler("u1", "TJGO", 2026);
  assert.deepEqual(ia.pedidos[0].pesquisaWeb, { maxUsos: 6, dominios: ["tjgo.jus.br"] });
  assert.deepEqual(c.fontes, ["https://www.tjgo.jus.br/feriados-2026"]);
});

test("fonte sem o ano pedido também cai na pesquisa; nada achado vira aviso", async () => {
  const ia = new IaFalsa([{ encontrado: false, dias: [] }, { encontrado: true, dias: [] }]);
  const s = new CalendarioOficialService({ ia, baixar: async () => ({ tipo: "texto", texto: "Calendário 2025" }), clock: relogio });
  await assert.rejects(s.ler("u1", "TRT9", 2027), erro("nao_encontrado"));
  assert.equal(ia.pedidos.length, 2);
  assert.ok(ia.pedidos[1].pesquisaWeb);
});

test("pedido inválido, IA desligada ou com falha", async () => {
  const s = new CalendarioOficialService({ ia: new IaFalsa([]), baixar: async () => null, clock: relogio });
  await assert.rejects(s.ler("u1", "TJXX", 2026), erro("dados_invalidos"));
  await assert.rejects(s.ler("u1", "TJPR", 2030), erro("dados_invalidos"));
  await assert.rejects(new CalendarioOficialService({ clock: relogio }).ler("u1", "TJPR", 2026), erro("indisponivel"));
  const falha = new CalendarioOficialService({ ia: new IaFalsa([new Error("timeout")]), baixar: async () => ({ tipo: "texto", texto: "x" }), clock: relogio });
  await assert.rejects(falha.ler("u1", "TJPR", 2026), erro("indisponivel"));
});

test("escolha da cidade: locais do calendário e filtro", async () => {
  const { filtrarPorLocal, locaisDoCalendario } = await import("../lib/prazos/calendario-oficial.ts");
  const dias = limparDiasOficiais(
    [
      dia("2026-09-08", "Padroeira", { abrangencia: "municipal", local: "Curitiba" }),
      dia("2026-06-10", "Aniversário", { abrangencia: "municipal", local: "Foz do Iguaçu" }),
      dia("2026-06-05", "Suspensão de expediente"),
      dia("2026-12-10", "Aniversário", { abrangencia: "municipal", local: "Londrina" }),
      dia("2026-08-20", "Emancipação", { abrangencia: "orgao", local: "Vara do Trabalho de Assis Chateaubriand" }),
    ],
    2026,
  );
  assert.deepEqual(locaisDoCalendario(dias), ["Curitiba", "Foz do Iguaçu", "Londrina", "Vara do Trabalho de Assis Chateaubriand"]);
  assert.deepEqual(
    filtrarPorLocal(dias, "Curitiba").map((d) => d.inicio),
    ["2026-06-05", "2026-09-08"],
  );
  assert.equal(filtrarPorLocal(dias, "").length, 5);
});

test("nome e ramo de cada tribunal", async () => {
  const { nomeTribunal, ramoDoTribunal } = await import("../lib/prazos/tribunais.ts");
  assert.equal(nomeTribunal("tjpr"), "TJPR · Paraná");
  assert.equal(nomeTribunal("TRT9"), "TRT9 · Paraná");
  assert.equal(nomeTribunal("STJ"), "STJ · Superior Tribunal de Justiça");
  assert.match(nomeTribunal("TRF4"), /RS, SC, PR/);
  assert.equal(ramoDoTribunal("TJDFT"), "Justiça Estadual");
  assert.equal(ramoDoTribunal("TRT-9"), "Justiça do Trabalho");
  assert.equal(ramoDoTribunal("XYZ"), "");
});
