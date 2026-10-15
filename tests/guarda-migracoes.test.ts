import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { analisarMigracao, verificarMigracoes } from "../server/infra/postgres/guarda-migracoes.ts";

const existentes = readdirSync("drizzle")
  .filter((n) => n.endsWith(".sql"))
  .map((nome) => ({ nome, sql: readFileSync(`drizzle/${nome}`, "utf8") }));
const tags = existentes.map((a) => a.nome.replace(/\.sql$/, ""));

test("as migrações que já estão no repositório passam pela guarda", () => {
  for (const { nome, sql } of existentes) assert.deepEqual(analisarMigracao(sql), [], nome);
});

test("acusa o que apaga, reescreve ou desliga o isolamento", () => {
  const casos: [string, string][] = [
    ['DROP TABLE "intimacoes";', "apaga tabela"],
    ['ALTER TABLE "processos" DROP COLUMN "numero";', "apaga coluna"],
    ["TRUNCATE auditoria;", "esvazia tabela"],
    ["DELETE FROM sessoes WHERE true;", "apaga linhas"],
    ["UPDATE processos SET fase = 'x';", "reescreve linhas"],
    ['ALTER TABLE "processos" RENAME COLUMN "numero" TO "cnj";', "renomeia"],
    ['ALTER TABLE "processos" ALTER COLUMN "numero" SET DATA TYPE varchar(10);', "muda o tipo"],
    ["ALTER TABLE processos DISABLE ROW LEVEL SECURITY;", "desliga o isolamento"],
    ["ALTER TABLE processos NO FORCE ROW LEVEL SECURITY;", "desliga o isolamento"],
    ["DROP POLICY processos_do_escritorio ON processos;", "apaga política"],
    ["DO $$ BEGIN UPDATE processos SET fase = 'x'; END $$;", "reescreve linhas"],
  ];
  for (const [sql, regra] of casos) {
    const achados = analisarMigracao(sql);
    assert.ok(achados.some((a) => a.regra.startsWith(regra)), `${sql} deveria acusar "${regra}"`);
  }
});

test("não acusa o que só acrescenta nem palavras em comentários e textos", () => {
  const sql = [
    'CREATE TABLE "casos" ("id" uuid PRIMARY KEY, "nota" text DEFAULT \'DROP TABLE x\');',
    "-- antes daqui havia DELETE FROM casos",
    'ALTER TABLE "casos" ADD CONSTRAINT "f" FOREIGN KEY ("id") REFERENCES "processos"("id") ON DELETE cascade ON UPDATE no action;',
    "GRANT SELECT, INSERT, UPDATE, DELETE ON casos TO sentinela_app;",
    'ALTER TABLE "casos" ALTER COLUMN "nota" DROP NOT NULL;',
    "ALTER TABLE casos ENABLE ROW LEVEL SECURITY;",
  ].join("\n");
  assert.deepEqual(analisarMigracao(sql), []);
});

test("migração existente alterada ou apagada é erro", () => {
  const [a, b] = existentes;
  const r = verificarMigracoes(existentes, [{ ...a, sql: a.sql + "\n-- mexi" }, ...existentes.slice(2)], tags.filter((t) => t !== b.nome.replace(".sql", "")));
  assert.ok(r.erros.some((e) => e.includes(a.nome) && e.includes("alterada")));
  assert.ok(r.erros.some((e) => e.includes(b.nome) && e.includes("apagada")));
});

test("migração nova destrutiva só passa com a linha de autorização", () => {
  const nova = { nome: "9999_limpeza.sql", sql: 'ALTER TABLE "processos" DROP COLUMN "antiga";' };
  const sem = verificarMigracoes(existentes, [...existentes, nova], [...tags, "9999_limpeza"]);
  assert.equal(sem.erros.length, 1);
  const com = verificarMigracoes(existentes, [...existentes, { ...nova, sql: "-- mudanca-destrutiva-autorizada: Thiago, 15/10/2026, coluna sem uso desde a 0011\n" + nova.sql }], [...tags, "9999_limpeza"]);
  assert.deepEqual(com.erros, []);
  assert.equal(com.avisos.length, 1);
});

test("arquivo fora do _journal.json é erro", () => {
  const nova = { nome: "9999_solta.sql", sql: 'CREATE TABLE "x" ("id" uuid);' };
  const r = verificarMigracoes(existentes, [...existentes, nova], tags);
  assert.ok(r.erros.some((e) => e.includes("9999_solta") && e.includes("_journal")));
});
