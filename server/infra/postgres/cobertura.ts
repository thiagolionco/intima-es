import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { type DiaCoberto, diaEmBrasilia, type EstadoCobertura, mesclarDia } from "../../../lib/cobertura.ts";
import { somarDias } from "../../../lib/prazos/datas.ts";
import type { Clock } from "../../core/clock.ts";
import { type CoberturaRepository, DIAS_GUARDADOS } from "../../rondas/cobertura.ts";
import type { BancoDeDados } from "./conexao.ts";
import { comEscritorio } from "./contexto.ts";
import { registroCobertura } from "./schema.ts";

function paraDia(l: typeof registroCobertura.$inferSelect): DiaCoberto {
  return {
    termoId: l.termoId,
    dia: l.dia,
    estado: l.estado as EstadoCobertura,
    lidos: l.lidos,
    ...(l.esperados !== null ? { esperados: l.esperados } : {}),
    ...(l.latenciaMs !== null ? { latenciaMs: l.latenciaMs } : {}),
    ...(l.erro ? { erro: l.erro } : {}),
    tentativas: l.tentativas,
    verificadoEm: l.verificadoEm.toISOString(),
  };
}

/** Livro de cobertura no Postgres, sempre dentro de `comEscritorio` (RLS). */
export class CoberturaRepositoryPostgres implements CoberturaRepository {
  private readonly db: BancoDeDados;
  private readonly clock: Clock;
  constructor(db: BancoDeDados, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  async registrar(usuarioId: string, dias: DiaCoberto[]) {
    if (!dias.length) return;
    await comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return;
      const termos = [...new Set(dias.map((d) => d.termoId))];
      const desde = dias.reduce((m, d) => (d.dia < m ? d.dia : m), dias[0].dia);
      const atuais = await tx
        .select()
        .from(registroCobertura)
        .where(and(eq(registroCobertura.escritorioId, escritorioId), inArray(registroCobertura.termoId, termos), gte(registroCobertura.dia, desde)));
      const anteriores = new Map(atuais.map((l) => [`${l.termoId}|${l.dia}`, paraDia(l)]));
      for (const novo of dias) {
        const d = mesclarDia(anteriores.get(`${novo.termoId}|${novo.dia}`), novo);
        const valores = {
          estado: d.estado,
          lidos: d.lidos,
          esperados: d.esperados ?? null,
          latenciaMs: d.latenciaMs ?? null,
          erro: d.erro ?? null,
          tentativas: d.tentativas,
          verificadoEm: new Date(d.verificadoEm),
        };
        await tx
          .insert(registroCobertura)
          .values({ escritorioId, termoId: d.termoId, dia: d.dia, ...valores })
          .onConflictDoUpdate({ target: [registroCobertura.escritorioId, registroCobertura.termoId, registroCobertura.dia], set: valores });
      }
      const limite = somarDias(diaEmBrasilia(this.clock.agora()), -DIAS_GUARDADOS);
      await tx.delete(registroCobertura).where(and(eq(registroCobertura.escritorioId, escritorioId), lt(registroCobertura.dia, limite)));
    });
  }

  listar(usuarioId: string, desde: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return [];
      const linhas = await tx
        .select()
        .from(registroCobertura)
        .where(and(eq(registroCobertura.escritorioId, escritorioId), gte(registroCobertura.dia, desde)));
      return linhas.map(paraDia);
    });
  }

  /** Some com o escritório (ON DELETE CASCADE) quando o último membro sai. */
  async excluirDoUsuario() {}
}
