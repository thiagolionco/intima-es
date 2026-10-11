import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Usuario } from "../server/auth/model.ts";
import { novoId } from "../server/core/crypto.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { importarDeDocumentos } from "../server/infra/postgres/importar.ts";
import { ArmazenamentoPostgres, EspacoTrabalhoRepositoryPostgres, UsuarioRepositoryPostgres } from "../server/infra/postgres/repositorios.ts";
import { UsuarioRepositoryDocumentos } from "../server/infra/repositorios.ts";
import { EspacoTrabalhoRepositoryDocumentos } from "../server/workspace/espaco-trabalho.ts";
import { type BancoDeTeste, criarBancoDeTeste, URL_TESTE } from "./apoio/postgres.ts";

const relogio = { agora: () => new Date("2026-10-11T12:00:00Z") };
const opcoes = { skip: URL_TESTE ? false : "defina TEST_DATABASE_URL para testar o Postgres" };
let banco: BancoDeTeste;

before(async () => {
  if (URL_TESTE) banco = await criarBancoDeTeste();
});
after(async () => {
  await banco?.encerrar();
});

function usuario(email: string, confirmado: boolean): Usuario {
  const t = "2026-10-01T09:00:00.000Z";
  return { id: novoId(), nome: "Ana", email, senhaHash: "scrypt$x", ...(confirmado ? { emailConfirmadoEm: t } : {}), totpAtivo: false, codigosRecuperacao: [], tentativasFalhas: 0, senhaAlteradaEm: t, aceitouTermosEm: t, criadoEm: t, atualizadoEm: t };
}

test("listarConfirmados devolve só quem confirmou o e-mail", opcoes, async () => {
  await banco.limpar();
  const repo = new UsuarioRepositoryPostgres(banco.db);
  const a = usuario("a@x.com", true);
  await repo.criar(a);
  await repo.criar(usuario("b@x.com", false));
  assert.deepEqual(await repo.listarConfirmados(), [a.id]);
});

test("espaço guarda suspensões e preferências, e cliente antigo não as apaga", opcoes, async () => {
  await banco.limpar();
  const u = usuario("a@x.com", true);
  await new UsuarioRepositoryPostgres(banco.db).criar(u);
  const repo = new EspacoTrabalhoRepositoryPostgres(banco.db, relogio);
  const suspensoes = [{ id: "s1", inicio: "2026-06-04", fim: "2026-06-04", descricao: "Corpus Christi" }];
  const preferencias = { avisos: { ativo: true, diasAntes: [1, 3], hora: 8 }, equipe: [{ id: "p1", nome: "Bia" }] };
  await repo.salvar(u.id, { intimacoes: [], termos: [], suspensoes, preferencias } as never, 0);
  await repo.salvar(u.id, { intimacoes: [], termos: [] }, 1);
  const e = await repo.ler(u.id);
  assert.deepEqual(e.suspensoes, suspensoes);
  assert.deepEqual(e.preferencias, preferencias);
});

test("documentos soltos: lê, altera em série, aceita null e remove", opcoes, async () => {
  const docs = new ArmazenamentoPostgres(banco.db);
  assert.equal(await docs.ler("google/x", null), null);
  await docs.alterar<number>("contador", 0, (n) => ({ valor: n + 1, resultado: undefined }));
  await Promise.all(Array.from({ length: 10 }, () => docs.alterar<number>("contador", 0, (n) => ({ valor: n + 1, resultado: undefined }))));
  assert.equal(await docs.ler("contador", 0), 11);
  await docs.alterar<{ a: number } | null>("g", null, () => ({ valor: { a: 1 }, resultado: undefined }));
  await docs.alterar<{ a: number } | null>("g", null, () => ({ valor: null, resultado: undefined }));
  assert.equal(await docs.ler("g", { a: 0 }), null);
  await docs.remover("g");
  assert.deepEqual(await docs.ler("g", { a: 0 }), { a: 0 });
});

test("a importação leva suspensões, preferências e os documentos da Agenda e dos avisos", opcoes, async () => {
  await banco.limpar();
  const origem = new ArmazenamentoEmMemoria();
  const u = usuario("a@x.com", true);
  await new UsuarioRepositoryDocumentos(origem).criar(u);
  const preferencias = { avisos: { ativo: true, diasAntes: [1], hora: 9 } };
  const suspensoes = [{ id: "s1", inicio: "2026-06-04", fim: "2026-06-04", descricao: "x" }];
  await new EspacoTrabalhoRepositoryDocumentos(origem, relogio).salvar(u.id, { intimacoes: [], termos: [], suspensoes, preferencias } as never, 0);
  await origem.alterar(`google/${u.id}`, null as unknown, () => ({ valor: { token: "cifrado" }, resultado: undefined }));
  await origem.alterar<Record<string, string[]>>(`avisos/${u.id}`, {}, () => ({ valor: { i1: ["2026-10-10"] }, resultado: undefined }));

  const r = await importarDeDocumentos(origem, banco.db, relogio);
  assert.equal(r.documentos, 2);
  const e = await new EspacoTrabalhoRepositoryPostgres(banco.db, relogio).ler(u.id);
  assert.deepEqual(e.suspensoes, suspensoes);
  assert.deepEqual(e.preferencias, preferencias);
  const docs = new ArmazenamentoPostgres(banco.db);
  assert.deepEqual(await docs.ler(`google/${u.id}`, null), { token: "cifrado" });
  assert.deepEqual(await docs.ler<Record<string, string[]>>(`avisos/${u.id}`, {}), { i1: ["2026-10-10"] });
});
