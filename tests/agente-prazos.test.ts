import { test } from "node:test";
import assert from "node:assert/strict";
import { conferir, type LeituraPrazo, leituraPorRegras, leituraValida, trechoEstaNoTexto } from "../lib/prazos/agente-prazos.ts";
import { executarAgentePrazos } from "../server/ia/agente-prazos.ts";
import type { PedidoIa, ServicoIa } from "../server/ia/ia.ts";
import { CASOS } from "./evals/agente-prazos.casos.ts";
import { avaliarCaso, placar } from "./evals/avaliar.ts";

const civel = { tribunal: "TJSP", classe: "Procedimento Comum Cível", orgao: "1ª Vara Cível", tipoDocumento: "Despacho", tipoComunicacao: "Intimação", dataDisponibilizacao: "2026-11-03" };
const intimacao = { ...civel, texto: "Vistos. Manifeste-se a parte autora sobre a contestação, no prazo de 15 (quinze) dias." };
const boa: LeituraPrazo = {
  tarefa: "replica",
  dias: 15,
  contagem: "uteis",
  dobro: false,
  prazoFixado: true,
  fundamento: "Fixado pelo juízo",
  trecho: "Manifeste-se a parte autora sobre a contestação, no prazo de 15 (quinze) dias",
  dataAudiencia: "",
  horaAudiencia: "",
  confianca: "alta",
  observacao: "",
};
const codigos = (c: ReturnType<typeof conferir>) => c.alertas.map((a) => a.codigo);

test("conferente: leitura certa passa e o Clepsa calcula o vencimento (feriado de 20/11 pulado)", () => {
  const c = conferir(intimacao, boa, [], "2026-11-03");
  assert.equal(c.situacao, "confere");
  assert.equal(c.calculo?.fim, "2026-11-26");
  assert.deepEqual(c.regra, { dias: 15, contagem: "uteis", dobro: false, fonte: "usuario", trecho: boa.trecho });
});

test("conferente: trecho inventado, dias diferentes do texto e prazo vencido são graves", () => {
  assert.ok(codigos(conferir(intimacao, { ...boa, trecho: "no prazo de 30 dias, sob pena de multa" }, [], "2026-11-03")).includes("trecho_inexistente"));
  const dias = conferir(intimacao, { ...boa, dias: 10 }, [], "2026-11-03");
  assert.equal(dias.situacao, "revisar");
  assert.ok(codigos(dias).includes("dias_divergentes"));
  assert.ok(codigos(conferir(intimacao, boa, [], "2026-12-01")).includes("vencido"));
});

test("conferente: penal em dias úteis é grave; dobro sem motivo é só atenção", () => {
  const penal = { ...civel, classe: "Ação Penal", texto: "Apresente a defesa memoriais, no prazo de 5 (cinco) dias." };
  const c = conferir(penal, { ...boa, tarefa: "alegacoes_finais", dias: 5, trecho: "Apresente a defesa memoriais" }, [], "2026-11-03");
  assert.equal(c.situacao, "revisar");
  assert.ok(codigos(c).includes("contagem_materia"));

  const dobro = conferir(intimacao, { ...boa, dobro: true }, [], "2026-11-03");
  assert.equal(dobro.situacao, "confere");
  assert.ok(codigos(dobro).includes("dobro_sem_motivo"));
});

test("conferente: providência sem prazo manda revisar; audiência confere a data no texto", () => {
  assert.equal(conferir(intimacao, { ...boa, dias: 0 }, [], "2026-11-03").situacao, "revisar");
  const aud = { ...civel, texto: "Designo audiência de conciliação para o dia 01/12/2026, às 14h30." };
  const leitura = { ...boa, tarefa: "audiencia" as const, dias: 0, trecho: "Designo audiência de conciliação", dataAudiencia: "2026-12-01", horaAudiencia: "14:30" };
  assert.equal(conferir(aud, leitura, [], "2026-11-03").situacao, "confere");
  assert.ok(codigos(conferir(aud, { ...leitura, dataAudiencia: "2026-12-02" }, [], "2026-11-03")).includes("audiencia_data"));
});

test("trecho: tolera acentos, aspas e reticências, mas não palavras trocadas", () => {
  const texto = "Intime-se o executado para pagar o débito, no prazo de 15 dias, sob pena de multa.";
  assert.ok(trechoEstaNoTexto("“para pagar o debito… sob pena de multa”", texto));
  assert.ok(!trechoEstaNoTexto("para pagar a dívida", texto));
});

test("leitura da IA: formato errado é recusado", () => {
  assert.equal(leituraValida({ ...boa, tarefa: "inventada" }), null);
  assert.equal(leituraValida({ ...boa, dias: "15" }), null);
  assert.equal(leituraValida({ ...boa, dataAudiencia: "31/02/2026" })?.dataAudiencia, "");
});

/** IA falsa: responde em fila e guarda os pedidos. */
function iaFalsa(respostas: LeituraPrazo[]) {
  const pedidos: PedidoIa[] = [];
  const ia: ServicoIa = {
    modelo: "claude-sonnet-5-5",
    async perguntar(p) {
      pedidos.push(p);
      const r = respostas.shift();
      if (!r) throw new Error("sem resposta");
      return { texto: JSON.stringify(r), fontesWeb: [], modelo: p.simples ? "claude-haiku-5-5" : "claude-sonnet-5-5" };
    },
  };
  return { ia, pedidos };
}

test("agente: leitura boa do Haiku encerra em uma chamada", async () => {
  const { ia, pedidos } = iaFalsa([boa]);
  const p = await executarAgentePrazos({ ia, intimacao, suspensoes: [], hoje: "2026-11-03" });
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].simples, true);
  assert.deepEqual(p.modelos, ["claude-haiku-5-5"]);
  assert.equal(p.conferencia.calculo?.fim, "2026-11-26");
});

test("agente: conferente reprova, o Sonnet relê uma vez com os problemas apontados", async () => {
  const { ia, pedidos } = iaFalsa([{ ...boa, dias: 10 }, boa]);
  const p = await executarAgentePrazos({ ia, intimacao, suspensoes: [], hoje: "2026-11-03" });
  assert.equal(pedidos.length, 2);
  assert.equal(pedidos[1].simples, false);
  const texto = pedidos[1].blocos.map((b) => ("texto" in b ? b.texto : "")).join("\n");
  assert.match(texto, /O texto fala em 15 dias/);
  assert.equal(p.tentativas, 2);
  assert.deepEqual(p.modelos, ["claude-haiku-5-5", "claude-sonnet-5-5"]);
  assert.equal(p.conferencia.situacao, "confere");
});

test("agente: releitura que falha devolve a primeira, marcada para revisar", async () => {
  const { ia } = iaFalsa([{ ...boa, dias: 10 }]);
  const p = await executarAgentePrazos({ ia, intimacao, suspensoes: [], hoje: "2026-11-03" });
  assert.equal(p.tentativas, 1);
  assert.equal(p.conferencia.situacao, "revisar");
});

test("agente sem IA: responde pelas regras, sem custo", async () => {
  const p = await executarAgentePrazos({ intimacao, suspensoes: [], hoje: "2026-11-03" });
  assert.equal(p.leitor, "regras");
  assert.equal(p.leitura.dias, 15);
  assert.deepEqual(leituraPorRegras(intimacao).tarefa, "replica");
});

test("avaliações: há entre 20 e 30 casos, com ids únicos", () => {
  assert.ok(CASOS.length >= 20 && CASOS.length <= 30);
  assert.equal(new Set(CASOS.map((c) => c.id)).size, CASOS.length);
});

test("avaliações: um leitor perfeito acerta 100% (o gabarito é coerente com o calendário)", async () => {
  const notas = [];
  for (const c of CASOS) {
    const e = c.esperado;
    const leitura: LeituraPrazo = { ...boa, ...e, prazoFixado: false, trecho: c.intimacao.texto.slice(0, 40), dataAudiencia: e.dataAudiencia ?? "", horaAudiencia: "" };
    const { ia } = iaFalsa([leitura, leitura]);
    notas.push(avaliarCaso(c, await executarAgentePrazos({ ia, intimacao: c.intimacao, suspensoes: c.suspensoes ?? [], hoje: c.intimacao.dataDisponibilizacao })));
  }
  const p = placar(notas);
  assert.equal(p.acertos, CASOS.length, notas.filter((n) => !n.acerto).map((n) => `${n.id}: ${n.obtido}`).join("; "));
});

test("avaliações: as regras, sem IA, nunca erram calado para depois (trava contra regressão)", async () => {
  const notas = [];
  for (const c of CASOS) notas.push(avaliarCaso(c, await executarAgentePrazos({ intimacao: c.intimacao, suspensoes: c.suspensoes ?? [], hoje: c.intimacao.dataDisponibilizacao })));
  const p = placar(notas);
  assert.equal(p.errosSilenciosos, 0, notas.filter((n) => n.erroSilencioso).map((n) => n.id).join(", "));
  assert.ok(p.acertos >= 20, `as regras acertavam 23 de 28; agora ${p.acertos}`);
});
