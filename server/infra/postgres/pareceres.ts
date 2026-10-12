import { and, eq } from "drizzle-orm";
import type { ParecerProcesso } from "../../../lib/processos.ts";
import { AppError } from "../../core/errors.ts";
import { type ParecerRepository, versaoOcupada } from "../../processos/pareceres.ts";
import type { BancoDeDados } from "./conexao.ts";
import { comEscritorio } from "./contexto.ts";
import { processoPareceres, processos } from "./schema.ts";

function paraParecer(l: typeof processoPareceres.$inferSelect): ParecerProcesso {
  return { id: l.id, processoId: l.processoId, versao: l.versao, texto: l.texto, autorId: l.autorId, autorNome: l.autorNome, criadoEm: l.criadoEm.toISOString() };
}

const violaUnicidade = (e: unknown) => (e as { code?: string }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505";

/** Versões do parecer no Postgres, sempre dentro de `comEscritorio` (RLS). */
export class ParecerRepositoryPostgres implements ParecerRepository {
  private readonly db: BancoDeDados;
  constructor(db: BancoDeDados) {
    this.db = db;
  }

  listar(usuarioId: string, processoId: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return [];
      const linhas = await tx
        .select()
        .from(processoPareceres)
        .where(and(eq(processoPareceres.escritorioId, escritorioId), eq(processoPareceres.processoId, processoId)));
      return linhas.map(paraParecer);
    });
  }

  async criar(usuarioId: string, p: ParecerProcesso) {
    try {
      await comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
        // O processo precisa ser do mesmo escritório (a chave estrangeira sozinha não olha o RLS).
        const [proc] = escritorioId ? await tx.select({ id: processos.id }).from(processos).where(and(eq(processos.escritorioId, escritorioId), eq(processos.id, p.processoId))) : [];
        if (!proc || !escritorioId) throw new AppError("nao_encontrado", "Processo não encontrado.");
        await tx.insert(processoPareceres).values({ ...p, escritorioId, criadoEm: new Date(p.criadoEm) });
      });
    } catch (e) {
      if (violaUnicidade(e)) throw versaoOcupada();
      throw e;
    }
  }

  /** O ON DELETE CASCADE já apagou as versões junto com o processo. */
  async excluirDoProcesso() {}

  /** As versões somem com o escritório (ON DELETE CASCADE) quando o último membro sai. */
  async excluirDoUsuario() {}
}
