import { and, eq } from "drizzle-orm";
import type { AnaliseRisco, NivelRisco } from "../../../lib/processos.ts";
import { AppError } from "../../core/errors.ts";
import type { AnaliseRepository } from "../../processos/analises.ts";
import type { BancoDeDados } from "./conexao.ts";
import { comEscritorio } from "./contexto.ts";
import { processoAnalises, processos } from "./schema.ts";

type Resultado = Pick<AnaliseRisco, "justificativa" | "pontosFortes" | "pontosFracos" | "documentos">;

function paraAnalise(l: typeof processoAnalises.$inferSelect): AnaliseRisco {
  const r = l.resultado as Resultado;
  return {
    id: l.id,
    processoId: l.processoId,
    nivel: l.nivel as NivelRisco,
    justificativa: r.justificativa,
    pontosFortes: r.pontosFortes ?? [],
    pontosFracos: r.pontosFracos ?? [],
    documentos: r.documentos ?? [],
    modelo: l.modelo,
    autorId: l.autorId,
    autorNome: l.autorNome,
    criadoEm: l.criadoEm.toISOString(),
  };
}

/** Análises de risco no Postgres, sempre dentro de `comEscritorio` (RLS). */
export class AnaliseRepositoryPostgres implements AnaliseRepository {
  private readonly db: BancoDeDados;
  constructor(db: BancoDeDados) {
    this.db = db;
  }

  listar(usuarioId: string, processoId: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return [];
      const linhas = await tx
        .select()
        .from(processoAnalises)
        .where(and(eq(processoAnalises.escritorioId, escritorioId), eq(processoAnalises.processoId, processoId)));
      return linhas.map(paraAnalise);
    });
  }

  async criar(usuarioId: string, a: AnaliseRisco) {
    await comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      // O processo precisa ser do mesmo escritório (a chave estrangeira sozinha não olha o RLS).
      const [proc] = escritorioId ? await tx.select({ id: processos.id }).from(processos).where(and(eq(processos.escritorioId, escritorioId), eq(processos.id, a.processoId))) : [];
      if (!proc || !escritorioId) throw new AppError("nao_encontrado", "Processo não encontrado.");
      const { justificativa, pontosFortes, pontosFracos, documentos } = a;
      await tx.insert(processoAnalises).values({
        id: a.id,
        escritorioId,
        processoId: a.processoId,
        nivel: a.nivel,
        resultado: { justificativa, pontosFortes, pontosFracos, documentos } satisfies Resultado,
        modelo: a.modelo,
        autorId: a.autorId,
        autorNome: a.autorNome,
        criadoEm: new Date(a.criadoEm),
      });
    });
  }

  /** O ON DELETE CASCADE já apagou as análises junto com o processo. */
  async excluirDoProcesso() {}

  /** As análises somem com o escritório (ON DELETE CASCADE) quando o último membro sai. */
  async excluirDoUsuario() {}
}
