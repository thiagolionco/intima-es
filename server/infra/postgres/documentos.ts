import { and, count, eq } from "drizzle-orm";
import { AppError } from "../../core/errors.ts";
import { type DocumentoRepository, documentoRepetido, type RegistroDocumento } from "../../processos/documentos.ts";
import type { BancoDeDados } from "./conexao.ts";
import { comEscritorio } from "./contexto.ts";
import { membros, processoDocumentos, processos } from "./schema.ts";

function paraRegistro(l: typeof processoDocumentos.$inferSelect): RegistroDocumento {
  return { id: l.id, processoId: l.processoId, nome: l.nome, tamanho: l.tamanho, hash: l.hash, caminho: l.caminho, criadoEm: l.criadoEm.toISOString() };
}

const violaUnicidade = (e: unknown) => (e as { code?: string }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505";

/** Metadados dos PDFs no Postgres, sempre dentro de `comEscritorio` (RLS). */
export class DocumentoRepositoryPostgres implements DocumentoRepository {
  private readonly db: BancoDeDados;
  constructor(db: BancoDeDados) {
    this.db = db;
  }

  listar(usuarioId: string, processoId: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return [];
      const linhas = await tx
        .select()
        .from(processoDocumentos)
        .where(and(eq(processoDocumentos.escritorioId, escritorioId), eq(processoDocumentos.processoId, processoId)));
      return linhas.map(paraRegistro);
    });
  }

  porId(usuarioId: string, processoId: string, id: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return null;
      const [l] = await tx
        .select()
        .from(processoDocumentos)
        .where(and(eq(processoDocumentos.escritorioId, escritorioId), eq(processoDocumentos.processoId, processoId), eq(processoDocumentos.id, id)));
      return l ? paraRegistro(l) : null;
    });
  }

  async criar(usuarioId: string, d: RegistroDocumento) {
    try {
      await comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
        // O processo precisa ser do mesmo escritório (a chave estrangeira sozinha não olha o RLS).
        const [p] = escritorioId ? await tx.select({ id: processos.id }).from(processos).where(and(eq(processos.escritorioId, escritorioId), eq(processos.id, d.processoId))) : [];
        if (!p || !escritorioId) throw new AppError("nao_encontrado", "Processo não encontrado.");
        const [igual] = await tx
          .select({ id: processoDocumentos.id })
          .from(processoDocumentos)
          .where(and(eq(processoDocumentos.escritorioId, escritorioId), eq(processoDocumentos.processoId, d.processoId), eq(processoDocumentos.hash, d.hash)));
        if (igual) throw documentoRepetido(igual.id);
        await tx.insert(processoDocumentos).values({ ...d, escritorioId, criadoEm: new Date(d.criadoEm) });
      });
    } catch (e) {
      if (violaUnicidade(e)) throw documentoRepetido();
      throw e;
    }
  }

  excluir(usuarioId: string, processoId: string, id: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return null;
      const [l] = await tx
        .delete(processoDocumentos)
        .where(and(eq(processoDocumentos.escritorioId, escritorioId), eq(processoDocumentos.processoId, processoId), eq(processoDocumentos.id, id)))
        .returning();
      return l ? paraRegistro(l) : null;
    });
  }

  /** O ON DELETE CASCADE já apagou os metadados junto com o processo. */
  async excluirDoProcesso() {}

  caminhosDaConta(usuarioId: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return [];
      const [{ total }] = await tx.select({ total: count() }).from(membros).where(eq(membros.escritorioId, escritorioId));
      if (total > 1) return [];
      const linhas = await tx.select({ caminho: processoDocumentos.caminho }).from(processoDocumentos).where(eq(processoDocumentos.escritorioId, escritorioId));
      return linhas.map((l) => l.caminho);
    });
  }

  /** Os metadados somem com o escritório (ON DELETE CASCADE) quando o último membro sai. */
  async excluirDoUsuario() {}
}
