import { and, asc, count, eq, gt, sql } from "drizzle-orm";
import type { ConvitePendente, PapelNoEscritorio } from "../../../lib/escritorio.ts";
import type { Usuario } from "../../auth/model.ts";
import { AppError } from "../../core/errors.ts";
import type { ConviteAchado, EscritorioRepository, NovoConvite } from "../../escritorio/escritorio.ts";
import type { BancoDeDados } from "./conexao.ts";
import { comEscritorio, entrarNoEscritorio, sairDoEscritorio, type Transacao } from "./contexto.ts";
import { paraColunasDeUsuario } from "./repositorios.ts";
import { convites, escritorios, espacosTrabalho, membros, processos, usuarios } from "./schema.ts";

const violaUnicidade = (e: unknown) => (e as { code?: string; cause?: { code?: string } }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505";

const semEscritorio = () => new AppError("nao_encontrado", "Sua conta não está ligada a nenhum escritório.");

/** Quantos donos o escritório do contexto tem. */
async function donos(tx: Transacao, escritorioId: string) {
  const [{ n }] = await tx.select({ n: count() }).from(membros).where(and(eq(membros.escritorioId, escritorioId), eq(membros.papel, "dono")));
  return n;
}

async function filiacao(tx: Transacao, escritorioId: string, usuarioId: string) {
  const [m] = await tx.select().from(membros).where(and(eq(membros.escritorioId, escritorioId), eq(membros.usuarioId, usuarioId)));
  return m ?? null;
}

/** Cria um escritório novo, vazio, com a conta como dona. A transação termina no contexto dele. */
async function escritorioProprio(tx: Transacao, usuarioId: string, novo: { id: string; nome: string; criadoEm: string }) {
  await entrarNoEscritorio(tx, usuarioId, novo.id);
  const criadoEm = new Date(novo.criadoEm);
  await tx.insert(escritorios).values({ id: novo.id, nome: novo.nome, criadoEm });
  await tx.insert(membros).values({ escritorioId: novo.id, usuarioId, papel: "dono", criadoEm });
  await tx.insert(espacosTrabalho).values({ escritorioId: novo.id });
}

/**
 * Equipe do escritório no Postgres. O que é do escritório roda em `comEscritorio` (RLS); a busca do
 * convite pelo token roda na conexão do app, sem contexto, porque quem abre o link ainda não entrou.
 */
export class EscritorioRepositoryPostgres implements EscritorioRepository {
  private readonly db: BancoDeDados;
  constructor(db: BancoDeDados) {
    this.db = db;
  }

  doUsuario(usuarioId: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return null;
      const [e] = await tx.select({ nome: escritorios.nome }).from(escritorios).where(eq(escritorios.id, escritorioId));
      const m = await filiacao(tx, escritorioId, usuarioId);
      return e && m ? { escritorioId, nome: e.nome, papel: m.papel } : null;
    });
  }

  membros(usuarioId: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return [];
      const linhas = await tx.select().from(membros).where(eq(membros.escritorioId, escritorioId)).orderBy(asc(membros.criadoEm));
      return linhas.map((l) => ({ usuarioId: l.usuarioId, papel: l.papel, desde: l.criadoEm.toISOString() }));
    });
  }

  async convites(usuarioId: string): Promise<ConvitePendente[]> {
    const linhas = await comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return [];
      return tx.select().from(convites).where(eq(convites.escritorioId, escritorioId)).orderBy(asc(convites.criadoEm));
    });
    const nomes = new Map<string, string>();
    for (const id of new Set(linhas.map((l) => l.convidadoPor).filter((x): x is string => !!x))) {
      const [u] = await this.db.select({ nome: usuarios.nome }).from(usuarios).where(eq(usuarios.id, id));
      if (u) nomes.set(id, u.nome);
    }
    return linhas.map((l) => ({
      id: l.id,
      email: l.email,
      papel: l.papel,
      ...(l.pessoaId ? { pessoaId: l.pessoaId } : {}),
      ...(l.convidadoPor && nomes.has(l.convidadoPor) ? { convidadoPor: nomes.get(l.convidadoPor) } : {}),
      criadoEm: l.criadoEm.toISOString(),
      expiraEm: l.expiraEm.toISOString(),
    }));
  }

  async criarConvite(usuarioId: string, c: NovoConvite) {
    await comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) throw semEscritorio();
      const valores = {
        id: c.id,
        escritorioId,
        tokenHash: c.tokenHash,
        email: c.email,
        papel: c.papel,
        pessoaId: c.pessoaId ?? null,
        convidadoPor: c.convidadoPor,
        criadoEm: new Date(c.criadoEm),
        expiraEm: new Date(c.expiraEm),
      };
      await tx.insert(convites).values(valores).onConflictDoUpdate({ target: [convites.escritorioId, convites.email], set: valores });
    });
  }

  revogarConvite(usuarioId: string, id: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return false;
      const apagados = await tx.delete(convites).where(and(eq(convites.escritorioId, escritorioId), eq(convites.id, id))).returning({ id: convites.id });
      return apagados.length > 0;
    });
  }

  conviteValido(tokenHash: string, agora: Date) {
    return this.db.transaction(async (tx): Promise<ConviteAchado | null> => {
      const [c] = await tx.select().from(convites).where(and(eq(convites.tokenHash, tokenHash), gt(convites.expiraEm, agora)));
      if (!c) return null;
      const convidadoPor = c.convidadoPor ? (await tx.select({ nome: usuarios.nome }).from(usuarios).where(eq(usuarios.id, c.convidadoPor)))[0]?.nome : undefined;
      // O nome do escritório está sob RLS forçado: lê no contexto dele (o token já provou o convite).
      await entrarNoEscritorio(tx, c.convidadoPor ?? c.id, c.escritorioId);
      const [e] = await tx.select({ nome: escritorios.nome }).from(escritorios).where(eq(escritorios.id, c.escritorioId));
      if (!e) return null;
      return {
        id: c.id,
        escritorioId: c.escritorioId,
        nomeEscritorio: e.nome,
        email: c.email,
        papel: c.papel,
        ...(c.pessoaId ? { pessoaId: c.pessoaId } : {}),
        ...(convidadoPor ? { convidadoPor } : {}),
        criadoEm: c.criadoEm.toISOString(),
        expiraEm: c.expiraEm.toISOString(),
      };
    });
  }

  /** Trava e devolve o convite (conexão do app, sem contexto); some se outro aceite chegou antes. */
  private async travarConvite(tx: Transacao, conviteId: string) {
    const [c] = await tx.select().from(convites).where(eq(convites.id, conviteId)).for("update");
    if (!c) throw new AppError("token_invalido", "Este convite não vale mais. Peça um novo a quem convidou.");
    return c;
  }

  async aceitar(conviteId: string, usuarioId: string) {
    await this.db.transaction(async (tx) => {
      const c = await this.travarConvite(tx, conviteId);
      await entrarNoEscritorio(tx, usuarioId, null);
      const atuais = await tx.select({ escritorioId: membros.escritorioId }).from(membros).where(eq(membros.usuarioId, usuarioId));
      if (!atuais.some((m) => m.escritorioId === c.escritorioId)) {
        for (const { escritorioId } of atuais) {
          await entrarNoEscritorio(tx, usuarioId, escritorioId);
          const [{ n }] = await tx.select({ n: count() }).from(membros).where(eq(membros.escritorioId, escritorioId));
          const [e] = await tx.select({ nome: escritorios.nome }).from(escritorios).where(eq(escritorios.id, escritorioId));
          if (n > 1) throw new AppError("conflito", `Sua conta já faz parte do escritório ${e?.nome ?? ""}. Saia dele (em Equipe) antes de aceitar este convite.`);
          const [espaco] = await tx
            .select({ itens: sql<number>`jsonb_array_length(${espacosTrabalho.intimacoes}) + jsonb_array_length(${espacosTrabalho.termos})` })
            .from(espacosTrabalho)
            .where(eq(espacosTrabalho.escritorioId, escritorioId));
          const [{ p }] = await tx.select({ p: count() }).from(processos).where(eq(processos.escritorioId, escritorioId));
          if (Number(espaco?.itens ?? 0) > 0 || p > 0) {
            throw new AppError(
              "conflito",
              "Sua conta já tem intimações, clientes monitorados ou processos no escritório próprio dela. Para não misturar nem perder nada, aceite o convite com outro e-mail ou exclua esses dados antes.",
            );
          }
          // Escritório próprio e vazio: sai e ele some (o espaço vai junto, em cascata).
          await tx.delete(membros).where(and(eq(membros.escritorioId, escritorioId), eq(membros.usuarioId, usuarioId)));
          await tx.delete(escritorios).where(eq(escritorios.id, escritorioId));
        }
        await entrarNoEscritorio(tx, usuarioId, c.escritorioId);
        await tx.insert(membros).values({ escritorioId: c.escritorioId, usuarioId, papel: c.papel, criadoEm: new Date() });
      }
      await sairDoEscritorio(tx);
      await tx.delete(convites).where(eq(convites.id, c.id));
    });
  }

  async criarContaPorConvite(u: Usuario, conviteId: string) {
    try {
      await this.db.transaction(async (tx) => {
        const c = await this.travarConvite(tx, conviteId);
        if (c.email !== u.email) throw new AppError("token_invalido", "Este convite é para outro e-mail.");
        await tx.insert(usuarios).values({ ...(paraColunasDeUsuario(u) as typeof usuarios.$inferInsert), id: u.id });
        await tx.delete(convites).where(eq(convites.id, c.id));
        await entrarNoEscritorio(tx, u.id, c.escritorioId);
        await tx.insert(membros).values({ escritorioId: c.escritorioId, usuarioId: u.id, papel: c.papel, criadoEm: new Date(u.criadoEm) });
      });
    } catch (e) {
      if (violaUnicidade(e)) throw new AppError("conflito", "Já existe uma conta com este e-mail. Entre nela para aceitar o convite.");
      throw e;
    }
  }

  async alterarPapel(usuarioId: string, alvoId: string, papel: PapelNoEscritorio) {
    await comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) throw semEscritorio();
      // Trava as filiações do escritório: duas mudanças ao mesmo tempo não deixam ele sem dono.
      await tx.select().from(membros).where(eq(membros.escritorioId, escritorioId)).for("update");
      const alvo = await filiacao(tx, escritorioId, alvoId);
      if (!alvo) throw new AppError("nao_encontrado", "Esta conta não está no escritório.");
      if (alvo.papel === papel) return;
      if (alvo.papel === "dono" && (await donos(tx, escritorioId)) <= 1) {
        throw new AppError("conflito", "O escritório precisa de pelo menos um dono. Torne outra pessoa dona antes.");
      }
      await tx.update(membros).set({ papel }).where(and(eq(membros.escritorioId, escritorioId), eq(membros.usuarioId, alvoId)));
    });
  }

  async remover(usuarioId: string, alvoId: string, novo: { id: string; nome: string; criadoEm: string }) {
    await comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) throw semEscritorio();
      await tx.select().from(membros).where(eq(membros.escritorioId, escritorioId)).for("update");
      const alvo = await filiacao(tx, escritorioId, alvoId);
      if (!alvo) throw new AppError("nao_encontrado", "Esta conta não está no escritório.");
      if (alvo.papel === "dono" && (await donos(tx, escritorioId)) <= 1) {
        throw new AppError("conflito", "O escritório precisa de pelo menos um dono. Torne outra pessoa dona antes.");
      }
      await tx.delete(membros).where(and(eq(membros.escritorioId, escritorioId), eq(membros.usuarioId, alvoId)));
      // Sem escritório, a conta não veria nem gravaria nada; recomeça num próprio, vazio.
      await escritorioProprio(tx, alvoId, novo);
    });
  }
}
