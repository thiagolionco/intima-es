import { and, count, eq } from "drizzle-orm";
import type { DadosItemBiblioteca } from "../../../lib/biblioteca.ts";
import { AppError } from "../../core/errors.ts";
import type { BibliotecaRepository, RegistroItem } from "../../biblioteca/biblioteca.ts";
import type { BancoDeDados } from "./conexao.ts";
import { comEscritorio } from "./contexto.ts";
import { bibliotecaItens, membros } from "./schema.ts";

function paraRegistro(l: typeof bibliotecaItens.$inferSelect): RegistroItem {
  return {
    id: l.id,
    tipo: l.tipo,
    titulo: l.titulo,
    ...(l.referencia ? { referencia: l.referencia } : {}),
    ...(l.tribunal ? { tribunal: l.tribunal } : {}),
    ...(l.area ? { area: l.area } : {}),
    ...(l.texto ? { texto: l.texto } : {}),
    etiquetas: l.etiquetas ?? [],
    ...(l.link ? { link: l.link } : {}),
    ...(l.arquivo ? { arquivo: l.arquivo } : {}),
    ...(l.textoArquivo ? { textoArquivo: l.textoArquivo } : {}),
    autorId: l.autorId,
    autorNome: l.autorNome,
    criadoEm: l.criadoEm.toISOString(),
    atualizadoEm: l.atualizadoEm.toISOString(),
  };
}

const colunasEditaveis = (d: DadosItemBiblioteca) => ({
  tipo: d.tipo,
  titulo: d.titulo,
  referencia: d.referencia ?? null,
  tribunal: d.tribunal ?? null,
  area: d.area ?? null,
  texto: d.texto ?? null,
  etiquetas: d.etiquetas,
  link: d.link ?? null,
});

/** Biblioteca no Postgres, sempre dentro de `comEscritorio` (RLS). */
export class BibliotecaRepositoryPostgres implements BibliotecaRepository {
  private readonly db: BancoDeDados;
  constructor(db: BancoDeDados) {
    this.db = db;
  }

  listar(usuarioId: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return [];
      return (await tx.select().from(bibliotecaItens).where(eq(bibliotecaItens.escritorioId, escritorioId))).map(paraRegistro);
    });
  }

  porId(usuarioId: string, id: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return null;
      const [l] = await tx.select().from(bibliotecaItens).where(and(eq(bibliotecaItens.escritorioId, escritorioId), eq(bibliotecaItens.id, id)));
      return l ? paraRegistro(l) : null;
    });
  }

  async criar(usuarioId: string, i: RegistroItem) {
    await comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) throw new AppError("nao_encontrado", "Escritório não encontrado.");
      await tx.insert(bibliotecaItens).values({
        id: i.id,
        escritorioId,
        ...colunasEditaveis(i),
        arquivo: i.arquivo ?? null,
        textoArquivo: i.textoArquivo ?? null,
        autorId: i.autorId,
        autorNome: i.autorNome,
        criadoEm: new Date(i.criadoEm),
        atualizadoEm: new Date(i.atualizadoEm),
      });
    });
  }

  atualizar(usuarioId: string, id: string, dados: DadosItemBiblioteca, atualizadoEm: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return null;
      const [l] = await tx
        .update(bibliotecaItens)
        .set({ ...colunasEditaveis(dados), atualizadoEm: new Date(atualizadoEm) })
        .where(and(eq(bibliotecaItens.escritorioId, escritorioId), eq(bibliotecaItens.id, id)))
        .returning();
      return l ? paraRegistro(l) : null;
    });
  }

  excluir(usuarioId: string, id: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return null;
      const [l] = await tx.delete(bibliotecaItens).where(and(eq(bibliotecaItens.escritorioId, escritorioId), eq(bibliotecaItens.id, id))).returning();
      return l ? paraRegistro(l) : null;
    });
  }

  caminhosDaConta(usuarioId: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return [];
      // A biblioteca é do escritório: só vai embora com a última pessoa dele.
      const [{ total }] = await tx.select({ total: count() }).from(membros).where(eq(membros.escritorioId, escritorioId));
      if (total > 1) return [];
      const linhas = await tx.select({ arquivo: bibliotecaItens.arquivo }).from(bibliotecaItens).where(eq(bibliotecaItens.escritorioId, escritorioId));
      return linhas.flatMap((l) => (l.arquivo ? [l.arquivo.caminho] : []));
    });
  }

  /** Os itens somem com o escritório (ON DELETE CASCADE) quando o último membro sai. */
  async excluirDoUsuario() {}
}
