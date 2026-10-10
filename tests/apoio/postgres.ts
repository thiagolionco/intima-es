import { randomBytes } from "node:crypto";
import pg from "pg";
import { type BancoDeDados, conectar, migrar } from "../../server/infra/postgres/conexao.ts";

/**
 * URL de um Postgres para testes (ex.: postgres://postgres@localhost:5432/postgres).
 * No CI ela é obrigatória: sem ela, os testes do banco seriam pulados em silêncio.
 */
export const URL_TESTE = process.env.TEST_DATABASE_URL;
if (process.env.CI && !URL_TESTE) throw new Error("TEST_DATABASE_URL é obrigatória no CI.");

const TABELAS = ["auditoria", "desafios_dois_fatores", "tokens_verificacao", "sessoes", "espacos_trabalho", "membros", "escritorios", "usuarios"];

export interface BancoDeTeste {
  db: BancoDeDados;
  url: string;
  limpar(): Promise<void>;
  encerrar(): Promise<void>;
}

/** Cria um banco novo e vazio (um por arquivo de teste), aplica as migrações e o devolve. */
export async function criarBancoDeTeste(): Promise<BancoDeTeste> {
  if (!URL_TESTE) throw new Error("Defina TEST_DATABASE_URL.");
  const nome = `teste_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: URL_TESTE });
  await admin.connect();
  await admin.query(`create database ${nome}`);
  // O papel é global no servidor; criá-lo aqui evita corrida entre arquivos de teste em paralelo.
  await admin.query("create role sentinela_app nologin nobypassrls").catch((e) => {
    if (e.code !== "42710" && e.code !== "23505") throw e;
  });
  await admin.end();

  const url = new URL(URL_TESTE);
  url.pathname = `/${nome}`;
  const conexao = conectar(url.toString(), 5);
  await migrar(conexao.db);

  return {
    db: conexao.db,
    url: url.toString(),
    async limpar() {
      await conexao.db.execute(`truncate ${TABELAS.join(", ")} cascade`);
    },
    async encerrar() {
      await conexao.encerrar();
      const fim = new pg.Client({ connectionString: URL_TESTE });
      await fim.connect();
      await fim.query(`drop database if exists ${nome} with (force)`);
      await fim.end();
    },
  };
}
