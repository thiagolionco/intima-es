import { test } from "node:test";
import assert from "node:assert/strict";
import type { Intimacao } from "../lib/types.ts";
import { AgendaService, eventoDoPrazo } from "../server/agenda/agenda.ts";
import { type ClienteGoogle, ErroGoogle, type EventoAgenda } from "../server/agenda/google.ts";
import { AssinadorDeLinks } from "../server/core/assinatura.ts";
import { Cofre } from "../server/core/cofre.ts";
import { AppError } from "../server/core/errors.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { EspacoTrabalhoRepositoryDocumentos } from "../server/workspace/espaco-trabalho.ts";

const USUARIO = "44444444-4444-4444-4444-444444444444";
const OUTRO = "55555555-5555-5555-5555-555555555555";
const SEGREDO = "s".repeat(40);

function intimacao(over: Partial<Intimacao>): Intimacao {
  return {
    id: "i1", origem: "comunica", cliente: "Construtora Alfa", tribunal: "TJSP", orgao: "5ª Vara Cível", dataDisponibilizacao: "2026-10-01",
    tipoComunicacao: "Intimação", meio: "D", tipoDocumento: "Despacho", classe: "", numeroProcesso: "1000001-11.2026.8.26.0100",
    partes: [], advogados: [], texto: "INTEIRO TEOR SIGILOSO", status: "nova", prazo: "2026-10-20", createdAt: "", updatedAt: "", ...over,
  };
}

/** Google de mentira: guarda agendas e eventos em memória e registra as chamadas. */
class GoogleFalso implements ClienteGoogle {
  agendas = new Map<string, Map<string, EventoAgenda>>();
  chamadas: string[] = [];
  revogados: string[] = [];
  private seq = 0;
  urlConsentimento({ state }: { state: string }) {
    return `https://google.test/consent?state=${state}`;
  }
  async trocarCodigo(codigo: string) {
    return { refreshToken: `refresh-${codigo}` };
  }
  async acessar(refresh: string) {
    if (refresh === "refresh-revogado") throw new ErroGoogle(400, "invalid_grant: Token has been expired or revoked.");
    return "acesso";
  }
  async revogar(refresh: string) {
    this.revogados.push(refresh);
  }
  async criarAgenda() {
    const id = `agenda${++this.seq}`;
    this.agendas.set(id, new Map());
    this.chamadas.push("criarAgenda");
    return id;
  }
  private agenda(id: string) {
    const a = this.agendas.get(id);
    if (!a) throw new ErroGoogle(404, "Not Found");
    return a;
  }
  async criarEvento(_: string, agendaId: string, e: EventoAgenda) {
    const id = `ev${++this.seq}`;
    this.agenda(agendaId).set(id, e);
    this.chamadas.push(`criar ${e.data}`);
    return id;
  }
  async atualizarEvento(_: string, agendaId: string, eventoId: string, e: EventoAgenda) {
    const a = this.agenda(agendaId);
    if (!a.has(eventoId)) throw new ErroGoogle(404, "Not Found");
    a.set(eventoId, e);
    this.chamadas.push(`atualizar ${e.data}`);
  }
  async apagarEvento(_: string, agendaId: string, eventoId: string) {
    if (!this.agenda(agendaId).delete(eventoId)) throw new ErroGoogle(410, "Gone");
    this.chamadas.push("apagar");
  }
}

function montar() {
  const clock = { agora: () => new Date("2026-10-11T12:00:00Z") };
  const db = new ArmazenamentoEmMemoria();
  const espacos = new EspacoTrabalhoRepositoryDocumentos(db, clock);
  const google = new GoogleFalso();
  const agenda = new AgendaService({
    google, espacos, documentos: db, cofre: new Cofre(SEGREDO, "google-agenda"), assinador: new AssinadorDeLinks(SEGREDO), clock,
    listarUsuarios: async () => [USUARIO, OUTRO], urlApp: () => "https://clepsa.test",
  });
  return { db, espacos, google, agenda };
}

async function conectar(agenda: AgendaService, codigo = "abc") {
  const url = agenda.iniciar(USUARIO, "https://clepsa.test/api/google/retorno");
  const state = new URL(url).searchParams.get("state")!;
  await agenda.concluir(USUARIO, state, codigo, "https://clepsa.test/api/google/retorno");
}

test("o evento leva processo, responsável e link, mas nunca o inteiro teor", () => {
  const e = eventoDoPrazo(intimacao({ responsavelId: "ana", resumo: { texto: "Juiz mandou contestar.\nContestar em 15 dias.", em: "" } }), [{ id: "ana", nome: "Ana Souza" }], "https://clepsa.test");
  assert.equal(e.data, "2026-10-20");
  assert.match(e.titulo, /Construtora Alfa/);
  assert.match(e.descricao, /Responsável: Ana Souza/);
  assert.match(e.descricao, /https:\/\/clepsa\.test\/intimacoes\/i1/);
  assert.doesNotMatch(e.descricao, /SIGILOSO/);
});

test("o retorno do Google só vale para a conta que pediu", async () => {
  const { agenda } = montar();
  const state = new URL(agenda.iniciar(OUTRO, "x")).searchParams.get("state")!;
  await assert.rejects(agenda.concluir(USUARIO, state, "abc", "x"), (e: unknown) => e instanceof AppError && e.codigo === "token_invalido");
  await assert.rejects(agenda.concluir(USUARIO, "forjado.abc", "abc", "x"), AppError);
});

test("conecta, cria a agenda e mantém só os prazos em aberto, mexendo só no que mudou", async () => {
  const { db, espacos, google, agenda } = montar();
  await espacos.salvar(USUARIO, { intimacoes: [intimacao({}), intimacao({ id: "i2", prazo: "2026-10-22" }), intimacao({ id: "i3", status: "respondida" }), intimacao({ id: "i4", prazo: undefined })], termos: [] }, 0);
  await conectar(agenda);

  assert.deepEqual(google.chamadas, ["criarAgenda", "criar 2026-10-20", "criar 2026-10-22"]);
  const guardado = JSON.stringify(await db.ler(`google/${USUARIO}`, null));
  assert.doesNotMatch(guardado, /refresh-abc/, "o token fica cifrado");
  assert.equal((await agenda.estado(USUARIO)).prazosNaAgenda, 2);

  google.chamadas = [];
  await agenda.sincronizar(USUARIO);
  assert.deepEqual(google.chamadas, [], "nada mudou, nada é enviado");

  const atual = await espacos.ler(USUARIO);
  await espacos.salvar(USUARIO, { intimacoes: [intimacao({ prazo: "2026-10-21" }), intimacao({ id: "i2", prazo: "2026-10-22", status: "respondida" })], termos: [] }, atual.revisao);
  await agenda.sincronizar(USUARIO);
  assert.deepEqual(google.chamadas, ["apagar", "atualizar 2026-10-21"]);
  assert.equal((await agenda.estado(USUARIO)).prazosNaAgenda, 1);
});

test("recria o que foi apagado no Google e avisa quando o acesso foi retirado", async () => {
  const { db, espacos, google, agenda } = montar();
  await espacos.salvar(USUARIO, { intimacoes: [intimacao({})], termos: [] }, 0);
  await conectar(agenda);

  google.agendas.clear();
  const atual = await espacos.ler(USUARIO);
  await espacos.salvar(USUARIO, { intimacoes: [intimacao({ prazo: "2026-10-23" })], termos: [] }, atual.revisao);
  await agenda.sincronizar(USUARIO);
  assert.equal(google.agendas.size, 1, "agenda nova criada");
  assert.equal([...google.agendas.values()][0].size, 1);
  assert.equal((await agenda.estado(USUARIO)).erro, undefined);

  await conectar(agenda, "revogado");
  assert.deepEqual(google.revogados, ["refresh-abc"], "a conexão anterior é revogada ao reconectar");
  assert.match((await agenda.estado(USUARIO)).erro ?? "", /Conecte de novo/);

  await agenda.desconectar(USUARIO);
  assert.equal((await agenda.estado(USUARIO)).conectado, false);
  assert.equal(await db.ler(`google/${USUARIO}`, null), null);
  assert.equal((await agenda.rodar()).contas, 0);
});

test("sem chaves do Google a agenda fica indisponível", async () => {
  const { espacos, db } = montar();
  const agenda = new AgendaService({ espacos, documentos: db, cofre: new Cofre(SEGREDO, "x"), assinador: new AssinadorDeLinks(SEGREDO), clock: { agora: () => new Date() }, listarUsuarios: async () => [], urlApp: () => "" });
  assert.equal(agenda.disponivel, false);
  assert.throws(() => agenda.iniciar(USUARIO, "x"), AppError);
  assert.deepEqual(await agenda.estado(USUARIO), { disponivel: false, conectado: false });
});
