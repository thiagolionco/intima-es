import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { alertaPrescricao, cnjValido, diasParaPrescrever, intimacoesDoProcesso, lerValor, mascaraCNJ, normalizarProcesso, referencia, textoPrescricao, validarProcesso } from "../lib/processos.ts";
import type { Intimacao } from "../lib/types.ts";
import type { Usuario } from "../server/auth/model.ts";
import { novoId } from "../server/core/crypto.ts";
import { AppError } from "../server/core/errors.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { comEscritorio } from "../server/infra/postgres/contexto.ts";
import { ProcessoRepositoryPostgres } from "../server/infra/postgres/processos.ts";
import { UsuarioRepositoryPostgres } from "../server/infra/postgres/repositorios.ts";
import { processos } from "../server/infra/postgres/schema.ts";
import { type ProcessoRepository, ProcessoRepositoryDocumentos, ProcessosService } from "../server/processos/processos.ts";
import { type BancoDeTeste, criarBancoDeTeste, URL_TESTE } from "./apoio/postgres.ts";

/** Monta um número CNJ válido calculando os dígitos verificadores. */
function cnj(sequencial: string, ano = "2024", justica = "8", tribunal = "26", origem = "0100"): string {
  const base = `${sequencial.padStart(7, "0")}${ano}${justica}${tribunal}${origem}`;
  let r = 0;
  for (const c of `${base}00`) r = (r * 10 + Number(c)) % 97;
  const dv = String(98 - r).padStart(2, "0");
  return `${base.slice(0, 7)}${dv}${base.slice(7)}`;
}

const relogio = { agora: () => new Date("2026-10-12T12:00:00Z") };
const UM = cnj("1234567");
const DOIS = cnj("7654321");
const TRES = cnj("1112223");

test("confere os dígitos verificadores do número CNJ", () => {
  assert.ok(cnjValido(UM));
  assert.ok(cnjValido(mascaraCNJ(UM)));
  const dvErrado = UM.slice(0, 7) + String((Number(UM.slice(7, 9)) + 1) % 100).padStart(2, "0") + UM.slice(9);
  assert.ok(!cnjValido(dvErrado));
  assert.ok(!cnjValido("123"));
  assert.equal(mascaraCNJ(UM), `${UM.slice(0, 7)}-${UM.slice(7, 9)}.${UM.slice(9, 13)}.${UM.slice(13, 14)}.${UM.slice(14, 16)}.${UM.slice(16)}`);
});

test("lê o valor da causa em reais", () => {
  assert.equal(lerValor("R$ 1.234,56"), 123456);
  assert.equal(lerValor("1234,5"), 123450);
  assert.equal(lerValor("1000"), 100000);
  assert.equal(lerValor(""), undefined);
  assert.equal(lerValor("12,345"), null);
  assert.equal(lerValor("abc"), null);
});

test("valida e normaliza os dados do processo", () => {
  assert.deepEqual(Object.keys(validarProcesso({})).sort(), ["cliente", "polo"]);
  assert.deepEqual(Object.keys(validarProcesso({ fase: "protocolado" })).sort(), ["cliente", "numero", "polo"]);
  assert.match(validarProcesso({ numero: "1234", cliente: "A", polo: "ativo" }).numero!, /20 dígitos/);
  assert.deepEqual(validarProcesso({ numero: mascaraCNJ(UM), cliente: "Alfa", polo: "passivo", valorCausa: -1 }), { valorCausa: "Valor da causa inválido." });
  assert.deepEqual(normalizarProcesso({ numero: mascaraCNJ(UM), cliente: " Alfa ", polo: "ativo", tribunal: "tjsp", orgao: "  ", valorCausa: 100 }), {
    numero: UM,
    fase: "protocolado",
    cliente: "Alfa",
    polo: "ativo",
    tribunal: "TJSP",
    valorCausa: 100,
  });
});

test("caso em preparação dispensa o número; protocolado exige", () => {
  assert.deepEqual(validarProcesso({ cliente: "Alfa", polo: "ativo", fase: "triagem" }), {});
  assert.deepEqual(validarProcesso({ cliente: "Alfa", polo: "ativo" }), {});
  assert.match(validarProcesso({ cliente: "Alfa", polo: "ativo", fase: "protocolado" }).numero!, /Informe/);
  // Número digitado ainda é conferido, mesmo antes do protocolo.
  assert.match(validarProcesso({ cliente: "Alfa", polo: "ativo", fase: "correcao", numero: "123" }).numero!, /20 dígitos/);
  assert.deepEqual(validarProcesso({ cliente: "A", polo: "ativo", fase: "arquivado", area: "espacial", tipo: "x", prescricao: "2026-02-30", dataAtendimento: "ontem" }), {
    fase: "Fase inválida.",
    area: "Área inválida.",
    tipo: "Tipo inválido.",
    dataAtendimento: "Data inválida.",
    prescricao: "Data inválida.",
  });
  assert.deepEqual(normalizarProcesso({ numero: "", cliente: "Alfa", polo: "passivo", area: "trabalhista", tipo: "defesa", prescricao: "2028-03-01", dataAtendimento: "" }), {
    fase: "triagem",
    area: "trabalhista",
    tipo: "defesa",
    prescricao: "2028-03-01",
    cliente: "Alfa",
    polo: "passivo",
  });
});

test("conta os dias até a prescrição", () => {
  assert.equal(diasParaPrescrever("2026-11-14", "2026-10-15"), 30);
  assert.equal(diasParaPrescrever("2026-10-14", "2026-10-15"), -1);
  assert.equal(diasParaPrescrever(undefined, "2026-10-15"), undefined);
  // Atravessa o fim do horário de verão sem errar por um dia.
  assert.equal(diasParaPrescrever("2027-03-01", "2026-10-01"), 151);
  assert.equal(textoPrescricao(30), "Prescreve em 30 dias");
  assert.equal(textoPrescricao(0), "Prescreve hoje");
  assert.equal(textoPrescricao(-1), "Prescrito há 1 dia");
  assert.deepEqual([-1, 0, 30, 31, 90, 91].map(alertaPrescricao), ["vencida", "urgente", "urgente", "atencao", "atencao", "ok"]);
  assert.equal(referencia({ cliente: "Ana", parteContraria: "Banco Beta" }), "Ana × Banco Beta");
  assert.equal(referencia({ cliente: "Ana" }), "Ana");
});

test("liga as intimações ao processo pelo número, da mais recente para a mais antiga", () => {
  const i = (id: string, numeroProcesso: string, dataDisponibilizacao: string) => ({ id, numeroProcesso, dataDisponibilizacao }) as Intimacao;
  const lista = [i("a", mascaraCNJ(UM), "2026-01-10"), i("b", DOIS, "2026-02-01"), i("c", UM, "2026-03-05")];
  assert.deepEqual(intimacoesDoProcesso(lista, UM).map((x) => x.id), ["c", "a"]);
});

/** Comportamento comum às duas implementações do repositório. */
async function contrato(repo: ProcessoRepository, ana: string, beto: string) {
  const servico = new ProcessosService(repo, relogio);
  const p = await servico.criar(ana, { numero: mascaraCNJ(UM), cliente: "Construtora Alfa", polo: "ativo", valorCausa: 150000 });
  assert.equal(p.numero, UM);

  await assert.rejects(servico.criar(ana, { numero: UM, cliente: "Outro", polo: "passivo" }), (e) => e instanceof AppError && e.codigo === "conflito" && e.detalhes?.id === p.id);
  await assert.rejects(servico.criar(ana, { numero: "1", cliente: "X", polo: "ativo" }), (e) => e instanceof AppError && e.codigo === "dados_invalidos" && e.detalhes?.campo === "numero");

  // O mesmo número pode existir em outro escritório, e um não vê o do outro.
  await servico.criar(beto, { numero: UM, cliente: "Cliente do Beto", polo: "passivo" });
  assert.deepEqual((await servico.listar(ana)).map((x) => x.cliente), ["Construtora Alfa"]);
  await assert.rejects(servico.obter(beto, p.id), (e) => e instanceof AppError && e.codigo === "nao_encontrado");
  await assert.rejects(servico.atualizar(beto, p.id, { numero: UM, cliente: "Invasor", polo: "ativo" }), (e) => e instanceof AppError && e.codigo === "nao_encontrado");
  await assert.rejects(servico.excluir(beto, p.id), (e) => e instanceof AppError && e.codigo === "nao_encontrado");

  // Editar manda o processo inteiro: o valor da causa omitido some.
  const editado = await servico.atualizar(ana, p.id, { numero: UM, cliente: "Construtora Alfa S.A.", polo: "ativo", parteContraria: "Banco Beta" });
  assert.equal(editado.cliente, "Construtora Alfa S.A.");
  assert.equal(editado.valorCausa, undefined);
  assert.equal(editado.criadoEm, p.criadoEm);
  assert.deepEqual(await servico.obter(ana, p.id), editado);

  const segundo = await servico.criar(ana, { numero: DOIS, cliente: "Alfa", polo: "passivo" });
  await assert.rejects(servico.atualizar(ana, segundo.id, { numero: UM, cliente: "Alfa", polo: "passivo" }), (e) => e instanceof AppError && e.codigo === "conflito");

  // Casos em preparação não têm número e não esbarram uns nos outros.
  const caso = await servico.criar(ana, { cliente: "Maria", parteContraria: "Loja Gama", polo: "ativo", area: "consumidor", tipo: "acao", dataAtendimento: "2026-10-10", prescricao: "2029-01-31" });
  const outroCaso = await servico.criar(ana, { cliente: "João", polo: "passivo", tipo: "defesa", fase: "correcao" });
  assert.equal(caso.fase, "triagem");
  assert.equal(caso.numero, undefined);
  assert.equal(outroCaso.fase, "correcao");
  assert.deepEqual(await servico.obter(ana, caso.id), caso);
  await assert.rejects(servico.atualizar(ana, caso.id, { ...caso, fase: "protocolado" }), (e) => e instanceof AppError && e.detalhes?.campo === "numero");
  const protocolado = await servico.atualizar(ana, caso.id, { ...caso, fase: "protocolado", numero: mascaraCNJ(TRES), dataProtocolo: "2026-10-14", comarca: "Campinas" });
  assert.deepEqual([protocolado.fase, protocolado.numero, protocolado.dataProtocolo, protocolado.comarca, protocolado.prescricao], ["protocolado", TRES, "2026-10-14", "Campinas", "2029-01-31"]);
  await servico.excluir(ana, caso.id);
  await servico.excluir(ana, outroCaso.id);

  await servico.excluir(ana, p.id);
  assert.deepEqual((await servico.listar(ana)).map((x) => x.id), [segundo.id]);
  assert.equal((await servico.listar(beto)).length, 1);
}

test("processos em documento", async () => {
  await contrato(new ProcessoRepositoryDocumentos(new ArmazenamentoEmMemoria()), novoId(), novoId());
});

const opcoes = { skip: URL_TESTE ? false : "defina TEST_DATABASE_URL para testar o Postgres" };
let banco: BancoDeTeste;

before(async () => {
  if (URL_TESTE) banco = await criarBancoDeTeste();
});
after(async () => {
  await banco?.encerrar();
});

function usuario(email: string): Usuario {
  const t = "2026-10-01T09:00:00.000Z";
  return { id: novoId(), nome: "Ana", email, senhaHash: "scrypt$x", emailConfirmadoEm: t, totpAtivo: false, codigosRecuperacao: [], tentativasFalhas: 0, senhaAlteradaEm: t, aceitouTermosEm: t, criadoEm: t, atualizadoEm: t };
}

test("processos no Postgres, isolados por escritório", opcoes, async () => {
  await banco.limpar();
  const usuarios = new UsuarioRepositoryPostgres(banco.db);
  const ana = usuario("ana@x.com");
  const beto = usuario("beto@x.com");
  await usuarios.criar(ana);
  await usuarios.criar(beto);
  await contrato(new ProcessoRepositoryPostgres(banco.db), ana.id, beto.id);

  // O banco (não só o filtro do código) esconde os processos do outro escritório.
  await comEscritorio(banco.db, ana.id, async (tx) => {
    const todos = await tx.select().from(processos);
    assert.ok(todos.every((p) => p.cliente !== "Cliente do Beto"));
  });

  // Excluir a conta apaga o escritório e, junto, os processos dele.
  await usuarios.excluir(beto.id);
  assert.equal((await banco.db.select().from(processos).where(eq(processos.cliente, "Cliente do Beto"))).length, 0);
});
