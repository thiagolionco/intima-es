/**
 * Barra migração que pode apagar ou expor dados dos clientes.
 *
 *   node --experimental-strip-types scripts/verificar-migracoes.mts --base origin/main
 *     (CI) compara drizzle/ com a base: nada existente muda, nada novo é destrutivo sem autorização.
 *
 *   BANCO_URL=... node --experimental-strip-types scripts/verificar-migracoes.mts --pendentes
 *     (antes de migrar a produção) lista as migrações que faltam aplicar e barra as destrutivas.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { analisarMigracao, autorizada, verificarMigracoes, type Arquivo } from "../server/infra/postgres/guarda-migracoes.ts";

const PASTA = "drizzle";
const journal: { entries: { tag: string; when: number }[] } = JSON.parse(readFileSync(path.join(PASTA, "meta", "_journal.json"), "utf8"));
const atuais: Arquivo[] = readdirSync(PASTA)
  .filter((n) => n.endsWith(".sql"))
  .sort()
  .map((nome) => ({ nome, sql: readFileSync(path.join(PASTA, nome), "utf8") }));

const args = process.argv.slice(2);

if (args[0] === "--base" && args[1]) {
  const base = args[1];
  const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  const nomes = git("ls-tree", "--name-only", `${base}:${PASTA}`).split("\n").filter((n) => n.endsWith(".sql"));
  const anteriores = nomes.map((nome) => ({ nome, sql: git("show", `${base}:${PASTA}/${nome}`) }));
  const { erros, avisos } = verificarMigracoes(anteriores, atuais, journal.entries.map((e) => e.tag));
  for (const a of avisos) console.log(`AVISO ${a}`);
  for (const e of erros) console.error(`ERRO ${e}`);
  if (erros.length) process.exit(1);
  console.log(`Migrações conferidas contra ${base}: ${atuais.length} arquivos, ${atuais.length - anteriores.length} novos, nenhum problema.`);
} else if (args[0] === "--pendentes") {
  const url = process.env.BANCO_URL;
  if (!url) {
    console.error("Defina BANCO_URL.");
    process.exit(1);
  }
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  let ultima = 0;
  try {
    const r = await cliente.query<{ ultima: string | null }>("select max(created_at)::text as ultima from drizzle.__drizzle_migrations");
    ultima = Number(r.rows[0]?.ultima ?? 0);
  } finally {
    await cliente.end();
  }
  const pendentes = journal.entries.filter((e) => e.when > ultima);
  if (!pendentes.length) {
    console.log("Nenhuma migração pendente: o banco já está na versão do código.");
    process.exit(0);
  }
  let barrada = false;
  for (const { tag } of pendentes) {
    const sql = readFileSync(path.join(PASTA, `${tag}.sql`), "utf8");
    const achados = analisarMigracao(sql);
    if (!achados.length) console.log(`Pendente: ${tag} (só acrescenta)`);
    else if (autorizada(sql)) console.log(`Pendente: ${tag} (destrutiva, AUTORIZADA no arquivo: ${achados.map((a) => a.regra).join("; ")})`);
    else {
      barrada = true;
      console.error(`BARRADA: ${tag} pode apagar ou expor dados e não tem autorização: ${achados.map((a) => a.regra).join("; ")}`);
    }
  }
  if (barrada) process.exit(1);
} else {
  console.error("Uso: --base <ref-do-git>  ou  --pendentes (com BANCO_URL)");
  process.exit(2);
}
