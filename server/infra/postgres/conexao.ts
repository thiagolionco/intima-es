import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "node:path";
import * as schema from "./schema.ts";

export type BancoDeDados = NodePgDatabase<typeof schema>;

export interface Conexao {
  db: BancoDeDados;
  encerrar(): Promise<void>;
}

/** Abre um pool de conexões. A URL vem de DATABASE_URL (ver server/config.ts). */
export function conectar(url: string, maxConexoes = 10): Conexao {
  const pool = new pg.Pool({ connectionString: url, max: maxConexoes });
  // Erro numa conexão ociosa (ex.: o banco reiniciou) não pode derrubar o processo.
  pool.on("error", (e) => console.error("[postgres] conexão ociosa falhou:", e.message));
  return { db: drizzle(pool, { schema }), encerrar: () => pool.end() };
}

/** Aplica as migrações pendentes da pasta drizzle/. */
export async function migrar(db: BancoDeDados, pasta = path.join(process.cwd(), "drizzle")): Promise<void> {
  await migrate(db, { migrationsFolder: pasta });
}
