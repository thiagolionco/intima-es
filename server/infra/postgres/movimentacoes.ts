import { and, eq } from "drizzle-orm";
import type { Movimentacao, MovimentacoesProcesso } from "../../../lib/processos.ts";
import { AppError } from "../../core/errors.ts";
import type { MovimentacaoRepository, ResumoMovimentacoes } from "../../processos/movimentacoes.ts";
import type { BancoDeDados } from "./conexao.ts";
import { comEscritorio } from "./contexto.ts";
import { processoMovimentacoes, processos } from "./schema.ts";

function paraMovimentacoes(l: typeof processoMovimentacoes.$inferSelect): MovimentacoesProcesso {
  return {
    processoId: l.processoId,
    consultadoEm: l.consultadoEm.toISOString(),
    encontrado: l.encontrado,
    ...(l.atualizadoNoTribunal ? { atualizadoNoTribunal: l.atualizadoNoTribunal.toISOString() } : {}),
    movimentos: (l.movimentos as Movimentacao[]) ?? [],
    ...(l.erro ? { erro: l.erro } : {}),
  };
}

/** Consultas ao DataJud no Postgres, sempre dentro de `comEscritorio` (RLS). */
export class MovimentacaoRepositoryPostgres implements MovimentacaoRepository {
  private readonly db: BancoDeDados;
  constructor(db: BancoDeDados) {
    this.db = db;
  }

  obter(usuarioId: string, processoId: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return null;
      const [l] = await tx
        .select()
        .from(processoMovimentacoes)
        .where(and(eq(processoMovimentacoes.escritorioId, escritorioId), eq(processoMovimentacoes.processoId, processoId)));
      return l ? paraMovimentacoes(l) : null;
    });
  }

  resumos(usuarioId: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      const r: Record<string, ResumoMovimentacoes> = {};
      if (!escritorioId) return r;
      const linhas = await tx
        .select({ id: processoMovimentacoes.processoId, consultadoEm: processoMovimentacoes.consultadoEm, ultimaEm: processoMovimentacoes.ultimaEm, ultimaNome: processoMovimentacoes.ultimaNome })
        .from(processoMovimentacoes)
        .where(eq(processoMovimentacoes.escritorioId, escritorioId));
      for (const l of linhas) {
        r[l.id] = { consultadoEm: l.consultadoEm.toISOString(), ...(l.ultimaEm && l.ultimaNome ? { ultima: { dataHora: l.ultimaEm.toISOString(), nome: l.ultimaNome } } : {}) };
      }
      return r;
    });
  }

  async salvar(usuarioId: string, m: MovimentacoesProcesso) {
    await comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      // O processo precisa ser do mesmo escritório (a chave estrangeira sozinha não olha o RLS).
      const [proc] = escritorioId ? await tx.select({ id: processos.id }).from(processos).where(and(eq(processos.escritorioId, escritorioId), eq(processos.id, m.processoId))) : [];
      if (!proc || !escritorioId) throw new AppError("nao_encontrado", "Processo não encontrado.");
      const [ultima] = m.movimentos;
      const valores = {
        consultadoEm: new Date(m.consultadoEm),
        encontrado: m.encontrado,
        atualizadoNoTribunal: m.atualizadoNoTribunal ? new Date(m.atualizadoNoTribunal) : null,
        movimentos: m.movimentos,
        erro: m.erro ?? null,
        ultimaEm: ultima ? new Date(ultima.dataHora) : null,
        ultimaNome: ultima?.nome ?? null,
      };
      await tx
        .insert(processoMovimentacoes)
        .values({ processoId: m.processoId, escritorioId, ...valores })
        .onConflictDoUpdate({ target: processoMovimentacoes.processoId, set: valores });
    });
  }

  /** O ON DELETE CASCADE já apagou a consulta junto com o processo. */
  async excluirDoProcesso() {}

  /** Some com o escritório (ON DELETE CASCADE) quando o último membro sai. */
  async excluirDoUsuario() {}
}
