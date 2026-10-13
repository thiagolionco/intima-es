import { asc, eq, sql } from "drizzle-orm";
import type { ContaNoDiretorio, DiretorioDeContas, FiliacaoEscritorio } from "../../admin/administracao.ts";
import { AppError } from "../../core/errors.ts";
import type { BancoDeDados } from "./conexao.ts";
import { entrarNoEscritorio, sairDoEscritorio } from "./contexto.ts";
import { paraUsuario } from "./repositorios.ts";
import { escritorios, membros, usuarios } from "./schema.ts";

/**
 * Lista as contas de todos os escritórios. As filiações são lidas com o papel restrito, como
 * qualquer outra leitura do app: quem libera ver outros escritórios é o RLS (migração 0009), e só
 * para um administrador ativo. Para qualquer outra conta, a consulta enxerga apenas o próprio
 * escritório, e a listagem é recusada.
 */
export class DiretorioDeContasPostgres implements DiretorioDeContas {
  private readonly db: BancoDeDados;
  constructor(db: BancoDeDados) {
    this.db = db;
  }

  async listar(administradorId: string): Promise<ContaNoDiretorio[]> {
    const filiacoes = await this.db.transaction(async (tx) => {
      await entrarNoEscritorio(tx, administradorId, null);
      const [{ admin }] = (await tx.execute<{ admin: boolean }>(sql`select app_usuario_e_administrador() as admin`)).rows;
      if (!admin) throw new AppError("sem_permissao", "Esta área é só para a administração da Clepsa.");
      const linhas = await tx
        .select({ usuarioId: membros.usuarioId, escritorioId: membros.escritorioId, nome: escritorios.nome, papel: membros.papel })
        .from(membros)
        .innerJoin(escritorios, eq(escritorios.id, membros.escritorioId))
        .orderBy(asc(membros.criadoEm));
      await sairDoEscritorio(tx);
      return linhas;
    });
    const porUsuario = new Map<string, FiliacaoEscritorio[]>();
    for (const { usuarioId, ...f } of filiacoes) porUsuario.set(usuarioId, [...(porUsuario.get(usuarioId) ?? []), f]);
    const contas = (await this.db.select().from(usuarios)).map(paraUsuario);
    return contas.map((usuario) => ({ usuario, escritorios: porUsuario.get(usuario.id) ?? [] }));
  }
}
