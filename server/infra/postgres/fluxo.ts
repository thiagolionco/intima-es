import { and, desc, eq } from "drizzle-orm";
import type { EventoFluxo, FluxoProcesso } from "../../../lib/fluxo/modelo.ts";
import type { Processo } from "../../../lib/processos.ts";
import { AppError } from "../../core/errors.ts";
import { conflitoDeFluxo, type FluxoRepository, type GravacaoChecklist, type GravacaoTransicao } from "../../fluxo/fluxo.ts";
import type { BancoDeDados } from "./conexao.ts";
import { comEscritorio, type Transacao } from "./contexto.ts";
import { processoEventos, processoFluxo, processos } from "./schema.ts";

const semNulos = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;

function paraFluxo(l: typeof processoFluxo.$inferSelect): FluxoProcesso {
  return { processoId: l.processoId, etapa: l.etapa, etapaDesde: l.etapaDesde.toISOString(), checklist: l.checklist ?? {}, versao: l.versao, atualizadoEm: l.atualizadoEm.toISOString() };
}

function paraEvento(l: typeof processoEventos.$inferSelect): EventoFluxo {
  return semNulos({ ...l, escritorioId: undefined, criadoEm: l.criadoEm.toISOString() }) as unknown as EventoFluxo;
}

const semEscritorio = () => new AppError("nao_encontrado", "Processo não encontrado.");

/**
 * Grava o estado só se a versão ainda for a esperada. Versão 0 é "ainda não existe": o INSERT
 * esbarra na chave primária se outra pessoa criou antes.
 */
async function gravarEstado(tx: Transacao, escritorioId: string, versaoEsperada: number, f: FluxoProcesso) {
  const valores = { etapa: f.etapa, etapaDesde: new Date(f.etapaDesde), checklist: f.checklist, versao: f.versao, atualizadoEm: new Date(f.atualizadoEm) };
  if (versaoEsperada === 0) {
    const r = await tx
      .insert(processoFluxo)
      .values({ processoId: f.processoId, escritorioId, ...valores })
      .onConflictDoNothing()
      .returning({ id: processoFluxo.processoId });
    if (!r.length) throw conflitoDeFluxo();
    return;
  }
  const r = await tx
    .update(processoFluxo)
    .set(valores)
    .where(and(eq(processoFluxo.escritorioId, escritorioId), eq(processoFluxo.processoId, f.processoId), eq(processoFluxo.versao, versaoEsperada)))
    .returning({ id: processoFluxo.processoId });
  if (!r.length) throw conflitoDeFluxo();
}

async function acrescentar(tx: Transacao, escritorioId: string, e: EventoFluxo) {
  await tx.insert(processoEventos).values({ ...e, escritorioId, criadoEm: new Date(e.criadoEm) });
}

/** Central de casos no Postgres. Cada gravação é uma transação só, dentro do RLS do escritório. */
export class FluxoRepositoryPostgres implements FluxoRepository {
  private readonly db: BancoDeDados;
  /** Converte a linha de `processos` no formato do domínio (o mesmo do repositório de processos). */
  private readonly lerProcesso: (usuarioId: string, id: string) => Promise<Processo | null>;
  constructor(db: BancoDeDados, lerProcesso: (usuarioId: string, id: string) => Promise<Processo | null>) {
    this.db = db;
    this.lerProcesso = lerProcesso;
  }

  listar(usuarioId: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return [];
      return (await tx.select().from(processoFluxo).where(eq(processoFluxo.escritorioId, escritorioId))).map(paraFluxo);
    });
  }

  obter(usuarioId: string, processoId: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return null;
      const [l] = await tx.select().from(processoFluxo).where(and(eq(processoFluxo.escritorioId, escritorioId), eq(processoFluxo.processoId, processoId)));
      return l ? paraFluxo(l) : null;
    });
  }

  eventos(usuarioId: string, processoId: string, limite: number) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return [];
      const linhas = await tx
        .select()
        .from(processoEventos)
        .where(and(eq(processoEventos.escritorioId, escritorioId), eq(processoEventos.processoId, processoId)))
        .orderBy(desc(processoEventos.criadoEm))
        .limit(limite);
      return linhas.map(paraEvento);
    });
  }

  async transicionar(usuarioId: string, g: GravacaoTransicao) {
    await comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) throw semEscritorio();
      // Troca a fase só se ela ainda for a que a avaliação viu.
      const mudou = await tx
        .update(processos)
        .set({ fase: g.para, atualizadoEm: new Date(g.novo.atualizadoEm) })
        .where(and(eq(processos.escritorioId, escritorioId), eq(processos.id, g.processo.id), eq(processos.fase, g.de)))
        .returning({ id: processos.id });
      if (!mudou.length) throw conflitoDeFluxo();
      await gravarEstado(tx, escritorioId, g.versaoEsperada, g.novo);
      await acrescentar(tx, escritorioId, g.evento);
    });
    const p = await this.lerProcesso(usuarioId, g.processo.id);
    if (!p) throw semEscritorio();
    return p;
  }

  async salvarChecklist(usuarioId: string, g: GravacaoChecklist) {
    await comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) throw semEscritorio();
      const [proc] = await tx.select({ id: processos.id }).from(processos).where(and(eq(processos.escritorioId, escritorioId), eq(processos.id, g.novo.processoId)));
      if (!proc) throw semEscritorio();
      await gravarEstado(tx, escritorioId, g.versaoEsperada, g.novo);
      await acrescentar(tx, escritorioId, g.evento);
    });
  }

  /** O ON DELETE CASCADE já apagou estado e eventos junto com o processo. */
  async excluirDoProcesso() {}

  /** Somem com o escritório (ON DELETE CASCADE) quando o último membro sai. */
  async excluirDoUsuario() {}
}
