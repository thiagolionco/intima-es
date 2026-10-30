import { and, eq } from "drizzle-orm";
import { AppError } from "../../core/errors.ts";
import type { Registro, RegistrosRepository, TipoRegistro } from "../../registros/registros.ts";
import type { BancoDeDados } from "./conexao.ts";
import { comEscritorio } from "./contexto.ts";
import { escritorioRegistros } from "./schema.ts";

function paraRegistro<T>(l: typeof escritorioRegistros.$inferSelect): Registro<T> {
  return {
    id: l.id,
    tipo: l.tipo as TipoRegistro,
    ...(l.processoId ? { processoId: l.processoId } : {}),
    ...(l.donoId ? { donoId: l.donoId } : {}),
    valor: l.valor as T,
    criadoEm: l.criadoEm.toISOString(),
    atualizadoEm: l.atualizadoEm.toISOString(),
  };
}

/** Registros no Postgres, sempre dentro de `comEscritorio` (RLS da migração 0014). */
export class RegistrosRepositoryPostgres implements RegistrosRepository {
  private readonly db: BancoDeDados;
  constructor(db: BancoDeDados) {
    this.db = db;
  }

  listar<T>(usuarioId: string, tipo: TipoRegistro, filtro: { processoId?: string } = {}) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return [];
      const condicoes = [eq(escritorioRegistros.escritorioId, escritorioId), eq(escritorioRegistros.tipo, tipo)];
      if (filtro.processoId) condicoes.push(eq(escritorioRegistros.processoId, filtro.processoId));
      return (await tx.select().from(escritorioRegistros).where(and(...condicoes))).map((l) => paraRegistro<T>(l));
    });
  }

  obter<T>(usuarioId: string, tipo: TipoRegistro, id: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return null;
      const [l] = await tx
        .select()
        .from(escritorioRegistros)
        .where(and(eq(escritorioRegistros.escritorioId, escritorioId), eq(escritorioRegistros.tipo, tipo), eq(escritorioRegistros.id, id)));
      return l ? paraRegistro<T>(l) : null;
    });
  }

  async gravar<T>(usuarioId: string, r: Registro<T>) {
    await comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) throw new AppError("nao_encontrado", "Escritório não encontrado.");
      const linha = {
        id: r.id,
        escritorioId,
        tipo: r.tipo,
        processoId: r.processoId ?? null,
        donoId: r.donoId ?? null,
        valor: r.valor as unknown,
        criadoEm: new Date(r.criadoEm),
        atualizadoEm: new Date(r.atualizadoEm),
      };
      await tx
        .insert(escritorioRegistros)
        .values(linha)
        .onConflictDoUpdate({ target: escritorioRegistros.id, set: { valor: linha.valor, processoId: linha.processoId, donoId: linha.donoId, atualizadoEm: linha.atualizadoEm } });
    });
  }

  alterar<T>(usuarioId: string, tipo: TipoRegistro, id: string, fn: (atual: Registro<T>) => T | null, atualizadoEm: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return null;
      const onde = and(eq(escritorioRegistros.escritorioId, escritorioId), eq(escritorioRegistros.tipo, tipo), eq(escritorioRegistros.id, id));
      // FOR UPDATE: duas pessoas mexendo no mesmo registro esperam uma pela outra.
      const [l] = await tx.select().from(escritorioRegistros).where(onde).for("update");
      if (!l) return null;
      const valor = fn(paraRegistro<T>(l));
      if (valor === null) return null;
      const [novo] = await tx
        .update(escritorioRegistros)
        .set({ valor: valor as unknown, atualizadoEm: new Date(atualizadoEm) })
        .where(onde)
        .returning();
      return novo ? paraRegistro<T>(novo) : null;
    });
  }

  excluir(usuarioId: string, tipo: TipoRegistro, id: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return false;
      const apagados = await tx
        .delete(escritorioRegistros)
        .where(and(eq(escritorioRegistros.escritorioId, escritorioId), eq(escritorioRegistros.tipo, tipo), eq(escritorioRegistros.id, id)))
        .returning({ id: escritorioRegistros.id });
      return apagados.length > 0;
    });
  }

  /** O ON DELETE CASCADE do processo já apaga. */
  async excluirDoProcesso() {}

  /** Os registros do escritório somem com ele; os pessoais, com a conta (ON DELETE CASCADE). */
  async excluirDoUsuario() {}
}
