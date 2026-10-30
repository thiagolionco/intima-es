import { and, eq, gte, lt, sql, sum, count } from "drizzle-orm";
import { AppError } from "../../core/errors.ts";
import type { RegistroUsoIa, SomaUsoIa, UsoIaRepository } from "../../ia/uso.ts";
import type { BancoDeDados } from "./conexao.ts";
import { comEscritorio, entrarNoEscritorio } from "./contexto.ts";
import { escritorios, usoIa } from "./schema.ts";

/** Uso da IA no Postgres. Gravação dentro de `comEscritorio`; leitura geral só para administrador (RLS da 0015). */
export class UsoIaRepositoryPostgres implements UsoIaRepository {
  private readonly db: BancoDeDados;
  constructor(db: BancoDeDados) {
    this.db = db;
  }

  async registrar(r: RegistroUsoIa) {
    await comEscritorio(this.db, r.usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return;
      await tx.insert(usoIa).values({
        id: r.id,
        escritorioId,
        usuarioId: r.usuarioId,
        funcao: r.funcao,
        modelo: r.modelo,
        entrada: r.entrada,
        saida: r.saida,
        cacheEscrita: r.cacheEscrita,
        cacheLeitura: r.cacheLeitura,
        buscasWeb: r.buscasWeb,
        criadoEm: new Date(r.em),
      });
    });
  }

  somarPorEscritorio(administradorId: string, desde: Date, ate: Date): Promise<SomaUsoIa[]> {
    return this.db.transaction(async (tx) => {
      // Papel restrito, como qualquer leitura do app: quem libera ver os outros escritórios é o RLS.
      await entrarNoEscritorio(tx, administradorId, null);
      const [{ admin }] = (await tx.execute<{ admin: boolean }>(sql`select app_usuario_e_administrador() as admin`)).rows;
      if (!admin) throw new AppError("sem_permissao", "Esta área é só para a administração da Clepsa.");
      const linhas = await tx
        .select({
          escritorioId: usoIa.escritorioId,
          escritorio: escritorios.nome,
          funcao: usoIa.funcao,
          modelo: usoIa.modelo,
          chamadas: count(),
          entrada: sum(usoIa.entrada),
          saida: sum(usoIa.saida),
          cacheEscrita: sum(usoIa.cacheEscrita),
          cacheLeitura: sum(usoIa.cacheLeitura),
          buscasWeb: sum(usoIa.buscasWeb),
        })
        .from(usoIa)
        .innerJoin(escritorios, eq(escritorios.id, usoIa.escritorioId))
        .where(and(gte(usoIa.criadoEm, desde), lt(usoIa.criadoEm, ate)))
        .groupBy(usoIa.escritorioId, escritorios.nome, usoIa.funcao, usoIa.modelo);
      // `sum` volta como texto (numeric no Postgres).
      return linhas.map((l) => ({
        ...l,
        chamadas: Number(l.chamadas),
        entrada: Number(l.entrada ?? 0),
        saida: Number(l.saida ?? 0),
        cacheEscrita: Number(l.cacheEscrita ?? 0),
        cacheLeitura: Number(l.cacheLeitura ?? 0),
        buscasWeb: Number(l.buscasWeb ?? 0),
      }));
    });
  }
}
