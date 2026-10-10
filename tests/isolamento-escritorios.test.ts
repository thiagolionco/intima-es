import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import type { Usuario } from "../server/auth/model.ts";
import { novoId } from "../server/core/crypto.ts";
import { comEscritorio, entrarNoEscritorio } from "../server/infra/postgres/contexto.ts";
import { EspacoTrabalhoRepositoryPostgres, UsuarioRepositoryPostgres } from "../server/infra/postgres/repositorios.ts";
import { escritorios, espacosTrabalho, membros, usuarios } from "../server/infra/postgres/schema.ts";
import { type BancoDeTeste, criarBancoDeTeste, URL_TESTE } from "./apoio/postgres.ts";

/**
 * Teste de vazamento: com o contexto de um escritório, o banco (não o código do app) precisa
 * impedir que se leia ou grave qualquer coisa de outro escritório.
 */

const relogio = { agora: () => new Date("2026-10-10T12:00:00Z") };
const opcoes = { skip: URL_TESTE ? false : "defina TEST_DATABASE_URL para rodar os testes de isolamento no Postgres" };

let banco: BancoDeTeste;
let ana: Usuario;
let beto: Usuario;
let escritorioAna: string;
let escritorioBeto: string;

function usuario(nome: string, email: string): Usuario {
  const agora = relogio.agora().toISOString();
  return {
    id: novoId(),
    nome,
    email,
    senhaHash: "scrypt$teste",
    totpAtivo: false,
    codigosRecuperacao: [],
    tentativasFalhas: 0,
    senhaAlteradaEm: agora,
    aceitouTermosEm: agora,
    criadoEm: agora,
    atualizadoEm: agora,
  };
}

/** Código de erro do Postgres, esteja ele no erro ou na causa (o Drizzle embrulha). */
const codigoPg = (e: unknown) => (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;

before(async () => {
  if (!URL_TESTE) return;
  banco = await criarBancoDeTeste();
  const usuariosRepo = new UsuarioRepositoryPostgres(banco.db);
  ana = usuario("Ana Souza", "ana@alfa.adv.br");
  beto = usuario("Beto Lima", "beto@beta.adv.br");
  await usuariosRepo.criar(ana);
  await usuariosRepo.criar(beto);
  const espacos = new EspacoTrabalhoRepositoryPostgres(banco.db, relogio);
  await espacos.salvar(ana.id, { intimacoes: [{ id: "i-ana" } as never], termos: [] }, 0);
  await espacos.salvar(beto.id, { intimacoes: [{ id: "i-beto" } as never], termos: [] }, 0);
  // Os testes rodam como superusuário, que enxerga tudo: serve para montar o cenário.
  const filiacoes = await banco.db.select().from(membros);
  escritorioAna = filiacoes.find((m) => m.usuarioId === ana.id)!.escritorioId;
  escritorioBeto = filiacoes.find((m) => m.usuarioId === beto.id)!.escritorioId;
});

after(async () => {
  await banco?.encerrar();
});

test("cada conta nova ganha o próprio escritório, como dona", opcoes, async () => {
  assert.notEqual(escritorioAna, escritorioBeto);
  const [m] = await banco.db.select().from(membros).where(eq(membros.usuarioId, ana.id));
  assert.equal(m.papel, "dono");
});

test("no contexto da Ana, só aparecem dados do escritório dela", opcoes, async () => {
  await comEscritorio(banco.db, ana.id, async (tx, escritorioId) => {
    assert.equal(escritorioId, escritorioAna);
    const espacos = await tx.select().from(espacosTrabalho);
    assert.deepEqual(espacos.map((e) => e.escritorioId), [escritorioAna]);
    assert.deepEqual((await tx.select().from(escritorios)).map((e) => e.id), [escritorioAna]);
    assert.deepEqual((await tx.select().from(membros)).map((m) => m.usuarioId), [ana.id]);
  });
});

test("vazamento: pedir o escritório do Beto pelo id não devolve nada", opcoes, async () => {
  await comEscritorio(banco.db, ana.id, async (tx) => {
    const espacos = await tx.select().from(espacosTrabalho).where(eq(espacosTrabalho.escritorioId, escritorioBeto));
    assert.equal(espacos.length, 0);
    const lista = await tx.select().from(escritorios).where(eq(escritorios.id, escritorioBeto));
    assert.equal(lista.length, 0);
  });
});

test("vazamento: alterar ou apagar dados do Beto não afeta nada", opcoes, async () => {
  await comEscritorio(banco.db, ana.id, async (tx) => {
    const alterados = await tx.update(espacosTrabalho).set({ intimacoes: [] }).where(eq(espacosTrabalho.escritorioId, escritorioBeto)).returning();
    assert.equal(alterados.length, 0);
    const apagados = await tx.delete(escritorios).where(eq(escritorios.id, escritorioBeto)).returning();
    assert.equal(apagados.length, 0);
  });
  const doBeto = await new EspacoTrabalhoRepositoryPostgres(banco.db, relogio).ler(beto.id);
  assert.deepEqual(doBeto.intimacoes, [{ id: "i-beto" }]);
});

test("vazamento: gravar no escritório do Beto é recusado pelo banco", opcoes, async () => {
  await assert.rejects(
    comEscritorio(banco.db, ana.id, (tx) => tx.insert(membros).values({ escritorioId: escritorioBeto, usuarioId: ana.id, papel: "dono", criadoEm: relogio.agora() })),
    (e) => codigoPg(e) === "42501",
  );
  await assert.rejects(
    comEscritorio(banco.db, ana.id, (tx) => tx.update(espacosTrabalho).set({ escritorioId: escritorioBeto }).where(eq(espacosTrabalho.escritorioId, escritorioAna))),
    (e) => codigoPg(e) === "42501",
  );
});

test("sem contexto de escritório, o papel do app não enxerga nada", opcoes, async () => {
  await banco.db.transaction(async (tx) => {
    await entrarNoEscritorio(tx, novoId(), null);
    assert.equal((await tx.select().from(espacosTrabalho)).length, 0);
    assert.equal((await tx.select().from(escritorios)).length, 0);
    assert.equal((await tx.select().from(membros)).length, 0);
  });
});

test("o papel do app não tem acesso às tabelas de identidade", opcoes, async () => {
  await assert.rejects(
    comEscritorio(banco.db, ana.id, (tx) => tx.select().from(usuarios)),
    (e) => codigoPg(e) === "42501",
  );
});

test("RLS está ligado em todas as tabelas e forçado nas do escritório", opcoes, async () => {
  const { rows } = await banco.db.execute<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
    sql`select relname, relrowsecurity, relforcerowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`,
  );
  assert.ok(rows.length >= 8);
  for (const r of rows) assert.ok(r.relrowsecurity, `RLS desligado em ${r.relname}`);
  for (const t of ["escritorios", "membros", "espacos_trabalho"]) {
    assert.ok(rows.find((r) => r.relname === t)?.relforcerowsecurity, `RLS não forçado em ${t}`);
  }
});

test("excluir a conta apaga o escritório que ficou sem ninguém", opcoes, async () => {
  const carla = usuario("Carla Dias", "carla@gama.adv.br");
  const repo = new UsuarioRepositoryPostgres(banco.db);
  await repo.criar(carla);
  await repo.excluir(carla.id);
  assert.equal(await repo.porId(carla.id), null);
  const restantes = await banco.db.select().from(escritorios);
  assert.deepEqual(restantes.map((e) => e.id).sort(), [escritorioAna, escritorioBeto].sort());
});
