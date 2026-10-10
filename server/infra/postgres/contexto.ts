import { asc, eq, sql } from "drizzle-orm";
import type { BancoDeDados } from "./conexao.ts";
import { membros } from "./schema.ts";

export type Transacao = Parameters<Parameters<BancoDeDados["transaction"]>[0]>[0];

/** Papel do banco sem permissão de furar o RLS (criado na migração 0001). */
const PAPEL_DO_APP = "sentinela_app";

/**
 * Passa a transação para o papel restrito e grava quem está agindo. A partir daqui, as
 * políticas de RLS só deixam ver e gravar dados do escritório informado.
 */
export async function entrarNoEscritorio(tx: Transacao, usuarioId: string, escritorioId: string | null): Promise<void> {
  await tx.execute(sql.raw(`set local role ${PAPEL_DO_APP}`));
  await tx.execute(sql`select set_config('app.usuario_id', ${usuarioId}, true)`);
  await tx.execute(sql`select set_config('app.escritorio_id', ${escritorioId ?? ""}, true)`);
}

/** Volta ao papel da conexão (dono das tabelas de identidade) dentro da mesma transação. */
export async function sairDoEscritorio(tx: Transacao): Promise<void> {
  await tx.execute(sql`reset role`);
  await tx.execute(sql`select set_config('app.usuario_id', '', true), set_config('app.escritorio_id', '', true)`);
}

/** Escritório do usuário (o mais antigo, se houver mais de um). Exige já estar no papel restrito. */
async function escritorioDoUsuario(tx: Transacao, usuarioId: string): Promise<string | null> {
  const [m] = await tx
    .select({ escritorioId: membros.escritorioId })
    .from(membros)
    .where(eq(membros.usuarioId, usuarioId))
    .orderBy(asc(membros.criadoEm))
    .limit(1);
  return m?.escritorioId ?? null;
}

/**
 * Executa `fn` numa transação isolada no escritório do usuário. `escritorioId` vem null
 * quando o usuário não pertence a nenhum escritório; nesse caso o RLS não deixa ver nada.
 */
export function comEscritorio<R>(db: BancoDeDados, usuarioId: string, fn: (tx: Transacao, escritorioId: string | null) => Promise<R>): Promise<R> {
  return db.transaction(async (tx) => {
    await entrarNoEscritorio(tx, usuarioId, null);
    const escritorioId = await escritorioDoUsuario(tx, usuarioId);
    if (escritorioId) await tx.execute(sql`select set_config('app.escritorio_id', ${escritorioId}, true)`);
    return fn(tx, escritorioId);
  });
}
