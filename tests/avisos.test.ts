import { test } from "node:test";
import assert from "node:assert/strict";
import { avisosDevidos, diaUtilAntes, diasUteisAte } from "../lib/avisos.ts";
import { Calendario } from "../lib/prazos/calendario.ts";
import type { Intimacao, PreferenciasAvisos } from "../lib/types.ts";
import { AvisosService } from "../server/avisos/avisos.ts";
import { AssinadorDeLinks } from "../server/core/assinatura.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import type { MensagemEmail } from "../server/infra/email/ports.ts";
import { EspacoTrabalhoRepositoryDocumentos } from "../server/workspace/espaco-trabalho.ts";

const USUARIO = "22222222-2222-2222-2222-222222222222";
const prefs: PreferenciasAvisos = { ativo: true, diasAntes: [3, 1, 0], hora: 7 };

function intimacao(over: Partial<Intimacao>): Intimacao {
  return {
    id: "i1", origem: "comunica", cliente: "Construtora Alfa", tribunal: "TJSP", orgao: "5ª Vara Cível", dataDisponibilizacao: "2026-10-08",
    tipoComunicacao: "Intimação", meio: "D", tipoDocumento: "Despacho", classe: "", numeroProcesso: "1000001-11.2026.8.26.0100",
    partes: [], advogados: [], texto: "Intime-se para contestar.", status: "nova", prazo: "2026-11-03", createdAt: "", updatedAt: "", ...over,
  };
}

test("conta dias úteis para trás e para frente pulando feriado", () => {
  const cal = new Calendario("TJSP");
  // 03/11/2026 é terça; 02/11 é Finados; 3 dias úteis antes = quinta 29/10.
  assert.equal(diaUtilAntes("2026-11-03", 1, cal), "2026-10-30");
  assert.equal(diaUtilAntes("2026-11-03", 3, cal), "2026-10-28");
  assert.equal(diasUteisAte("2026-10-30", "2026-11-03", cal), 1);
});

test("avisa na regra mais próxima já alcançada e não repete", () => {
  const lista = [intimacao({}), intimacao({ id: "i2", status: "respondida" }), intimacao({ id: "i3", prazo: undefined })];
  assert.deepEqual(avisosDevidos(lista, prefs, "2026-10-27", [], new Set()), [], "ainda cedo");
  const d = avisosDevidos(lista, prefs, "2026-10-28", [], new Set());
  assert.equal(d.length, 1);
  assert.equal(d[0].diasUteis, 3);
  assert.deepEqual(d[0].chaves, ["i1|2026-11-03|3"]);
  assert.equal(avisosDevidos(lista, prefs, "2026-10-29", [], new Set(d[0].chaves)).length, 0, "já avisado na regra de 3 dias");
  const ultimo = avisosDevidos(lista, prefs, "2026-10-30", [], new Set(d[0].chaves));
  assert.deepEqual(ultimo[0].chaves, ["i1|2026-11-03|3", "i1|2026-11-03|1"]);
  // Se o servidor ficou parado, no dia do vencimento sai um aviso só.
  assert.equal(avisosDevidos(lista, prefs, "2026-11-03", [], new Set())[0].chaves.length, 3);
  assert.equal(avisosDevidos(lista, prefs, "2026-11-04", [], new Set()).length, 0, "vencido não entra");
});

test("prazo alterado gera aviso de novo", () => {
  const enviados = new Set(["i1|2026-11-03|3"]);
  assert.equal(avisosDevidos([intimacao({ prazo: "2026-11-02" })], { ...prefs, diasAntes: [3] }, "2026-10-28", [], enviados).length, 1);
});

function montar(agoraIso: string) {
  let agora = new Date(agoraIso);
  const clock = { agora: () => agora };
  const db = new ArmazenamentoEmMemoria();
  const espacos = new EspacoTrabalhoRepositoryDocumentos(db, clock);
  const emails: MensagemEmail[] = [];
  const servico = new AvisosService({
    espacos,
    usuarios: { porId: async () => ({ id: USUARIO, email: "ana@escritorio.com.br" }) as never, listarConfirmados: async () => [USUARIO] },
    enviador: { nome: "teste", enviar: async (m) => void emails.push(m) },
    registro: db,
    assinador: new AssinadorDeLinks("x".repeat(40)),
    clock,
    urlApp: () => "https://clepsa.exemplo",
  });
  return { espacos, emails, servico, avancar: (iso: string) => (agora = new Date(iso)) };
}

test("envia um e-mail por dia, só depois da hora escolhida e só com avisos ligados", async () => {
  // 28/10/2026 06h em Brasília = 09h UTC.
  const { espacos, emails, servico, avancar } = montar("2026-10-28T09:00:00Z");
  await espacos.salvar(USUARIO, { intimacoes: [intimacao({})], termos: [], preferencias: { avisos: { ...prefs, ativo: false } } }, 0);
  assert.equal(await servico.daConta(USUARIO), 0, "desligado");
  await espacos.salvar(USUARIO, { intimacoes: [intimacao({})], termos: [], preferencias: { avisos: prefs } }, 1);
  assert.equal(await servico.daConta(USUARIO), 0, "antes das 7h");
  avancar("2026-10-28T10:30:00Z");
  assert.deepEqual(await servico.rodar(), { contas: 1, emails: 1 });
  assert.equal(emails[0].para, "ana@escritorio.com.br");
  assert.match(emails[0].assunto, /vence em 3 dias úteis/);
  assert.match(emails[0].texto, /Já cumpri: https:\/\/clepsa\.exemplo\/cumprir#token=/);
  assert.equal(await servico.daConta(USUARIO), 0, "não repete no mesmo dia");
  assert.equal(await servico.daConta(USUARIO, { forcar: true }), 1, "o teste manda mesmo assim");
});

test("o link Já cumpri marca como respondida e não aceita token adulterado", async () => {
  const { espacos, emails, servico, avancar } = montar("2026-10-28T10:30:00Z");
  await espacos.salvar(USUARIO, { intimacoes: [intimacao({})], termos: [], preferencias: { avisos: prefs } }, 0);
  await servico.daConta(USUARIO);
  const token = /token=([^\s]+)/.exec(emails[0].texto)![1];

  assert.deepEqual(await servico.consultar(token), { processo: "1000001-11.2026.8.26.0100", cliente: "Construtora Alfa", prazo: "2026-11-03", status: "nova" });
  await assert.rejects(servico.cumprir(token.slice(0, -2) + "xx"), { codigo: "token_invalido" });
  const r = await servico.cumprir(token);
  assert.equal(r.status, "respondida");
  const salvo = (await espacos.ler(USUARIO)).intimacoes[0];
  assert.equal(salvo.status, "respondida");
  assert.match(salvo.observacoes ?? "", /cumprida pelo link do aviso/);
  assert.equal((await servico.cumprir(token)).status, "respondida", "repetir não quebra");

  avancar("2026-12-01T10:30:00Z");
  await assert.rejects(servico.consultar(token), { codigo: "token_invalido" }, "expira em 30 dias");
});

test("num escritório com várias contas, cada uma recebe os prazos de que é responsável", async () => {
  const BETO = "33333333-3333-3333-3333-333333333333";
  const db = new ArmazenamentoEmMemoria();
  const clock = { agora: () => new Date("2026-10-28T10:30:00Z") };
  // As duas contas leem o mesmo espaço, como membros do mesmo escritório no Postgres.
  const base = new EspacoTrabalhoRepositoryDocumentos(db, clock);
  const espacos = { ler: () => base.ler(USUARIO), salvar: (_: string, d: never, r: number) => base.salvar(USUARIO, d, r), excluir: async () => {} };
  const emails: MensagemEmail[] = [];
  const contas: Record<string, { email: string; papel: "dono" | "advogado" }> = { [USUARIO]: { email: "ana@alfa.adv.br", papel: "dono" }, [BETO]: { email: "beto@alfa.adv.br", papel: "advogado" } };
  const servico = new AvisosService({
    espacos,
    usuarios: { porId: async (id) => ({ id, email: contas[id].email }) as never, listarConfirmados: async () => [USUARIO, BETO] },
    enviador: { nome: "teste", enviar: async (m) => void emails.push(m) },
    registro: db,
    assinador: new AssinadorDeLinks("x".repeat(40)),
    clock,
    urlApp: () => "https://clepsa.exemplo",
    papelDe: async (id) => contas[id].papel,
    membros: async () => [USUARIO, BETO],
  });
  const equipe = [
    { id: "p-beto", nome: "Beto", usuarioId: BETO },
    { id: "p-caio", nome: "Caio (sem conta)" },
  ];
  await base.salvar(
    USUARIO,
    {
      intimacoes: [
        intimacao({ id: "do-beto", numeroProcesso: "1111111-11.2026.8.26.0100", responsavelId: "p-beto" }),
        intimacao({ id: "do-caio", numeroProcesso: "2222222-22.2026.8.26.0100", responsavelId: "p-caio" }),
        intimacao({ id: "de-ninguem", numeroProcesso: "3333333-33.2026.8.26.0100" }),
      ],
      termos: [],
      preferencias: { avisos: prefs, equipe },
    },
    0,
  );
  assert.equal(await servico.daConta(BETO), 1);
  assert.match(emails[0].texto, /1111111/);
  assert.equal(await servico.daConta(USUARIO), 2, "a dona recebe o do Caio (sem conta) e o sem responsável");
  assert.doesNotMatch(emails[1].texto, /1111111/);
});
