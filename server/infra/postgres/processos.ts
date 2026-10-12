import { and, eq, ne } from "drizzle-orm";
import type { DadosProcesso, Processo } from "../../../lib/processos.ts";
import { AppError } from "../../core/errors.ts";
import { conflitoDeNumero, type ProcessoRepository } from "../../processos/processos.ts";
import type { BancoDeDados } from "./conexao.ts";
import { comEscritorio, type Transacao } from "./contexto.ts";
import { processos } from "./schema.ts";

type Linha = typeof processos.$inferSelect;

const semNulos = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;

function paraProcesso(l: Linha): Processo {
  return semNulos({
    id: l.id,
    numero: l.numero,
    cliente: l.cliente,
    parteContraria: l.parteContraria,
    polo: l.polo,
    tribunal: l.tribunal,
    orgao: l.orgao,
    classe: l.classe,
    valorCausa: l.valorCausa,
    responsavelId: l.responsavelId,
    observacoes: l.observacoes,
    criadoEm: l.criadoEm.toISOString(),
    atualizadoEm: l.atualizadoEm.toISOString(),
  }) as Processo;
}

/** Colunas dos dados editáveis; campo ausente vira NULL (a edição manda o processo inteiro). */
function colunas(d: DadosProcesso) {
  return {
    numero: d.numero,
    cliente: d.cliente,
    parteContraria: d.parteContraria ?? null,
    polo: d.polo,
    tribunal: d.tribunal ?? null,
    orgao: d.orgao ?? null,
    classe: d.classe ?? null,
    valorCausa: d.valorCausa ?? null,
    responsavelId: d.responsavelId ?? null,
    observacoes: d.observacoes ?? null,
  };
}

const violaUnicidade = (e: unknown) => (e as { code?: string }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505";

async function idComNumero(tx: Transacao, escritorioId: string, numero: string, exceto?: string) {
  const [l] = await tx
    .select({ id: processos.id })
    .from(processos)
    .where(and(eq(processos.escritorioId, escritorioId), eq(processos.numero, numero), ...(exceto ? [ne(processos.id, exceto)] : [])));
  return l?.id;
}

const semEscritorio = () => new AppError("nao_encontrado", "Sua conta não está ligada a nenhum escritório.");

/** Processos no Postgres. Tudo roda em `comEscritorio`: o RLS isola os escritórios mesmo que falte um filtro. */
export class ProcessoRepositoryPostgres implements ProcessoRepository {
  private readonly db: BancoDeDados;
  constructor(db: BancoDeDados) {
    this.db = db;
  }

  listar(usuarioId: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return [];
      const linhas = await tx.select().from(processos).where(eq(processos.escritorioId, escritorioId));
      return linhas.map(paraProcesso);
    });
  }

  porId(usuarioId: string, id: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return null;
      const [l] = await tx.select().from(processos).where(and(eq(processos.escritorioId, escritorioId), eq(processos.id, id)));
      return l ? paraProcesso(l) : null;
    });
  }

  async criar(usuarioId: string, p: Processo) {
    try {
      await comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
        if (!escritorioId) throw semEscritorio();
        const existente = await idComNumero(tx, escritorioId, p.numero);
        if (existente) throw conflitoDeNumero(existente);
        await tx.insert(processos).values({ ...colunas(p), id: p.id, escritorioId, criadoEm: new Date(p.criadoEm), atualizadoEm: new Date(p.atualizadoEm) });
      });
    } catch (e) {
      // Duas criações ao mesmo tempo: a segunda esbarra na unicidade.
      if (violaUnicidade(e)) throw conflitoDeNumero();
      throw e;
    }
  }

  async atualizar(usuarioId: string, id: string, dados: DadosProcesso, agora: string) {
    try {
      return await comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
        if (!escritorioId) return null;
        const [existe] = await tx.select({ id: processos.id }).from(processos).where(and(eq(processos.escritorioId, escritorioId), eq(processos.id, id)));
        if (!existe) return null;
        const outro = await idComNumero(tx, escritorioId, dados.numero, id);
        if (outro) throw conflitoDeNumero(outro);
        const [l] = await tx
          .update(processos)
          .set({ ...colunas(dados), atualizadoEm: new Date(agora) })
          .where(and(eq(processos.escritorioId, escritorioId), eq(processos.id, id)))
          .returning();
        return l ? paraProcesso(l) : null;
      });
    } catch (e) {
      if (violaUnicidade(e)) throw conflitoDeNumero();
      throw e;
    }
  }

  excluir(usuarioId: string, id: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return false;
      const apagados = await tx.delete(processos).where(and(eq(processos.escritorioId, escritorioId), eq(processos.id, id))).returning({ id: processos.id });
      return apagados.length > 0;
    });
  }

  /** Os processos são do escritório: somem com ele (ON DELETE CASCADE) quando o último membro sai. */
  async excluirDoUsuario() {}
}
