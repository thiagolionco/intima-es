import { and, asc, count, desc, eq, gt, lte, ne, sql } from "drizzle-orm";
import type { DesafioDoisFatores, EventoAuditoria, FinalidadeToken, Sessao, TipoEvento, TokenVerificacao, Usuario } from "../../auth/model.ts";
import type { Auditoria, DesafioRepository, SessaoRepository, TokenRepository, UsuarioRepository } from "../../auth/ports.ts";
import type { Clock } from "../../core/clock.ts";
import { novoId } from "../../core/crypto.ts";
import { AppError } from "../../core/errors.ts";
import type { EspacoTrabalho, EspacoTrabalhoRepository } from "../../workspace/espaco-trabalho.ts";
import type { Intimacao, TermoMonitorado } from "../../../lib/types.ts";
import type { BancoDeDados } from "./conexao.ts";
import { comEscritorio, entrarNoEscritorio, sairDoEscritorio } from "./contexto.ts";
import { auditoria, desafiosDoisFatores, escritorios, espacosTrabalho, membros, sessoes, tokensVerificacao, usuarios } from "./schema.ts";

/** Implementações dos repositórios sobre o PostgreSQL. Mesmas interfaces das versões em documento. */

const iso = (d: Date) => d.toISOString();
const isoOuNada = (d: Date | null) => (d ? d.toISOString() : undefined);
const data = (s: string) => new Date(s);
const dataOuNull = (s: string | undefined) => (s ? new Date(s) : null);
const semNulos = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;

const violaUnicidade = (e: unknown) => (e as { code?: string; cause?: { code?: string } }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505";

// ---------- Usuários ----------

type LinhaUsuario = typeof usuarios.$inferSelect;

function paraUsuario(l: LinhaUsuario): Usuario {
  return semNulos({
    id: l.id,
    nome: l.nome,
    email: l.email,
    escritorio: l.escritorio,
    oab: l.oab,
    senhaHash: l.senhaHash,
    emailConfirmadoEm: isoOuNada(l.emailConfirmadoEm),
    totpSegredo: l.totpSegredo,
    totpAtivo: l.totpAtivo,
    totpUltimoPasso: l.totpUltimoPasso,
    codigosRecuperacao: l.codigosRecuperacao,
    tentativasFalhas: l.tentativasFalhas,
    bloqueadoAte: isoOuNada(l.bloqueadoAte),
    senhaAlteradaEm: iso(l.senhaAlteradaEm),
    aceitouTermosEm: iso(l.aceitouTermosEm),
    criadoEm: iso(l.criadoEm),
    atualizadoEm: iso(l.atualizadoEm),
  }) as Usuario;
}

const CAMPOS_DATA = new Set<keyof Usuario>(["emailConfirmadoEm", "bloqueadoAte", "senhaAlteradaEm", "aceitouTermosEm", "criadoEm", "atualizadoEm"]);

/** Converte alterações parciais do domínio em valores de coluna. `undefined` explícito apaga o campo. */
function paraColunas(alteracoes: Partial<Usuario>): Partial<typeof usuarios.$inferInsert> {
  const colunas: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(alteracoes) as [keyof Usuario, unknown][]) {
    if (chave === "id") continue;
    colunas[chave] = CAMPOS_DATA.has(chave) ? dataOuNull(valor as string | undefined) : (valor ?? null);
  }
  return colunas as Partial<typeof usuarios.$inferInsert>;
}

export class UsuarioRepositoryPostgres implements UsuarioRepository {
  private readonly db: BancoDeDados;
  constructor(db: BancoDeDados) {
    this.db = db;
  }

  async porId(id: string) {
    const [l] = await this.db.select().from(usuarios).where(eq(usuarios.id, id));
    return l ? paraUsuario(l) : null;
  }

  async porEmail(email: string) {
    const [l] = await this.db.select().from(usuarios).where(eq(usuarios.email, email));
    return l ? paraUsuario(l) : null;
  }

  /** Cria a conta e, junto, o escritório dela, com o usuário como dono. */
  async criar(u: Usuario) {
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(usuarios).values({ ...(paraColunas(u) as typeof usuarios.$inferInsert), id: u.id });
        const escritorioId = novoId();
        const agora = data(u.criadoEm);
        await entrarNoEscritorio(tx, u.id, escritorioId);
        await tx.insert(escritorios).values({ id: escritorioId, nome: u.escritorio?.trim() || u.nome, criadoEm: agora });
        await tx.insert(membros).values({ escritorioId, usuarioId: u.id, papel: "dono", criadoEm: agora });
        await tx.insert(espacosTrabalho).values({ escritorioId });
      });
    } catch (e) {
      if (violaUnicidade(e)) throw new AppError("conflito", "Já existe uma conta com este e-mail.");
      throw e;
    }
  }

  async atualizar(id: string, alteracoes: Partial<Usuario>) {
    const colunas = paraColunas(alteracoes);
    const [l] = Object.keys(colunas).length
      ? await this.db.update(usuarios).set(colunas).where(eq(usuarios.id, id)).returning()
      : await this.db.select().from(usuarios).where(eq(usuarios.id, id));
    if (!l) throw new AppError("nao_encontrado", "Usuário não encontrado.");
    return paraUsuario(l);
  }

  /** Sai dos escritórios (apagando os que ficarem sem ninguém) e apaga a conta. */
  async excluir(id: string) {
    await this.db.transaction(async (tx) => {
      await entrarNoEscritorio(tx, id, null);
      const filiacoes = await tx.select({ escritorioId: membros.escritorioId }).from(membros).where(eq(membros.usuarioId, id));
      for (const { escritorioId } of filiacoes) {
        await entrarNoEscritorio(tx, id, escritorioId);
        await tx.delete(membros).where(and(eq(membros.escritorioId, escritorioId), eq(membros.usuarioId, id)));
        const [{ restantes }] = await tx.select({ restantes: count() }).from(membros).where(eq(membros.escritorioId, escritorioId));
        if (restantes === 0) await tx.delete(escritorios).where(eq(escritorios.id, escritorioId));
      }
      await sairDoEscritorio(tx);
      await tx.delete(usuarios).where(eq(usuarios.id, id));
    });
  }
}

// ---------- Sessões ----------

function paraSessao(l: typeof sessoes.$inferSelect): Sessao {
  return {
    id: l.id,
    usuarioId: l.usuarioId,
    criadaEm: iso(l.criadaEm),
    ultimoUsoEm: iso(l.ultimoUsoEm),
    expiraEm: iso(l.expiraEm),
    lembrar: l.lembrar,
    ip: l.ip,
    userAgent: l.userAgent,
  };
}

export class SessaoRepositoryPostgres implements SessaoRepository {
  private readonly db: BancoDeDados;
  private readonly clock: Clock;
  constructor(db: BancoDeDados, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  async porId(id: string) {
    const [l] = await this.db.select().from(sessoes).where(eq(sessoes.id, id));
    return l ? paraSessao(l) : null;
  }

  async doUsuario(usuarioId: string) {
    const linhas = await this.db
      .select()
      .from(sessoes)
      .where(and(eq(sessoes.usuarioId, usuarioId), gt(sessoes.expiraEm, this.clock.agora())))
      .orderBy(asc(sessoes.criadaEm));
    return linhas.map(paraSessao);
  }

  async salvar(s: Sessao) {
    const valores = {
      id: s.id,
      usuarioId: s.usuarioId,
      criadaEm: data(s.criadaEm),
      ultimoUsoEm: data(s.ultimoUsoEm),
      expiraEm: data(s.expiraEm),
      lembrar: s.lembrar,
      ip: s.ip,
      userAgent: s.userAgent,
    };
    await this.db.transaction(async (tx) => {
      await tx.delete(sessoes).where(lte(sessoes.expiraEm, this.clock.agora()));
      await tx.insert(sessoes).values(valores).onConflictDoUpdate({ target: sessoes.id, set: valores });
    });
  }

  async excluir(id: string) {
    await this.db.delete(sessoes).where(eq(sessoes.id, id));
  }

  async excluirDoUsuario(usuarioId: string, exceto?: string) {
    const removidas = await this.db
      .delete(sessoes)
      .where(and(eq(sessoes.usuarioId, usuarioId), exceto ? ne(sessoes.id, exceto) : undefined))
      .returning({ id: sessoes.id });
    return removidas.length;
  }
}

// ---------- Tokens de e-mail ----------

function paraToken(l: typeof tokensVerificacao.$inferSelect): TokenVerificacao {
  return { id: l.id, usuarioId: l.usuarioId, finalidade: l.finalidade, expiraEm: iso(l.expiraEm), criadoEm: iso(l.criadoEm) };
}

export class TokenRepositoryPostgres implements TokenRepository {
  private readonly db: BancoDeDados;
  private readonly clock: Clock;
  constructor(db: BancoDeDados, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  async salvar(t: TokenVerificacao) {
    const valores = { id: t.id, usuarioId: t.usuarioId, finalidade: t.finalidade, expiraEm: data(t.expiraEm), criadoEm: data(t.criadoEm) };
    await this.db.transaction(async (tx) => {
      await tx.delete(tokensVerificacao).where(lte(tokensVerificacao.expiraEm, this.clock.agora()));
      await tx.insert(tokensVerificacao).values(valores).onConflictDoUpdate({ target: tokensVerificacao.id, set: valores });
    });
  }

  async porId(id: string, finalidade: FinalidadeToken) {
    const [l] = await this.db
      .select()
      .from(tokensVerificacao)
      .where(and(eq(tokensVerificacao.id, id), eq(tokensVerificacao.finalidade, finalidade), gt(tokensVerificacao.expiraEm, this.clock.agora())));
    return l ? paraToken(l) : null;
  }

  /** Remove o token de qualquer jeito (uso único) e só o devolve se ainda valia para esta finalidade. */
  async consumir(id: string, finalidade: FinalidadeToken) {
    const [l] = await this.db.delete(tokensVerificacao).where(eq(tokensVerificacao.id, id)).returning();
    if (!l || l.finalidade !== finalidade || l.expiraEm <= this.clock.agora()) return null;
    return paraToken(l);
  }

  async excluirDoUsuario(usuarioId: string, finalidade?: FinalidadeToken) {
    await this.db
      .delete(tokensVerificacao)
      .where(and(eq(tokensVerificacao.usuarioId, usuarioId), finalidade ? eq(tokensVerificacao.finalidade, finalidade) : undefined));
  }
}

// ---------- Desafios de dois fatores ----------

export class DesafioRepositoryPostgres implements DesafioRepository {
  private readonly db: BancoDeDados;
  private readonly clock: Clock;
  constructor(db: BancoDeDados, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  async salvar(d: DesafioDoisFatores) {
    const valores = { id: d.id, usuarioId: d.usuarioId, lembrar: d.lembrar, tentativas: d.tentativas, expiraEm: data(d.expiraEm) };
    await this.db.transaction(async (tx) => {
      await tx.delete(desafiosDoisFatores).where(lte(desafiosDoisFatores.expiraEm, this.clock.agora()));
      await tx.insert(desafiosDoisFatores).values(valores).onConflictDoUpdate({ target: desafiosDoisFatores.id, set: valores });
    });
  }

  async porId(id: string) {
    const [l] = await this.db
      .select()
      .from(desafiosDoisFatores)
      .where(and(eq(desafiosDoisFatores.id, id), gt(desafiosDoisFatores.expiraEm, this.clock.agora())));
    return l ? { id: l.id, usuarioId: l.usuarioId, lembrar: l.lembrar, tentativas: l.tentativas, expiraEm: iso(l.expiraEm) } : null;
  }

  async excluir(id: string) {
    await this.db.delete(desafiosDoisFatores).where(eq(desafiosDoisFatores.id, id));
  }
}

// ---------- Auditoria ----------

export class AuditoriaPostgres implements Auditoria {
  private readonly db: BancoDeDados;
  private readonly clock: Clock;
  constructor(db: BancoDeDados, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  async registrar(evento: Omit<EventoAuditoria, "id" | "em">) {
    await this.db.insert(auditoria).values({
      id: novoId(),
      usuarioId: evento.usuarioId,
      tipo: evento.tipo,
      em: this.clock.agora(),
      ip: evento.ip,
      userAgent: evento.userAgent,
      detalhe: evento.detalhe ?? null,
    });
  }

  async doUsuario(usuarioId: string, limite = 100) {
    const linhas = await this.db.select().from(auditoria).where(eq(auditoria.usuarioId, usuarioId)).orderBy(desc(auditoria.ordem)).limit(limite);
    return linhas.map((l) =>
      semNulos({ id: l.id, usuarioId: l.usuarioId, tipo: l.tipo as TipoEvento, em: iso(l.em), ip: l.ip, userAgent: l.userAgent, detalhe: l.detalhe }) as EventoAuditoria,
    );
  }

  async excluirDoUsuario(usuarioId: string) {
    await this.db.delete(auditoria).where(eq(auditoria.usuarioId, usuarioId));
  }
}

// ---------- Espaço de trabalho (dados do escritório, sob RLS) ----------

const VAZIO: EspacoTrabalho = { intimacoes: [], termos: [], revisao: 0, atualizadoEm: null };

function paraEspaco(l: typeof espacosTrabalho.$inferSelect): EspacoTrabalho {
  return {
    intimacoes: l.intimacoes as Intimacao[],
    termos: l.termos as TermoMonitorado[],
    revisao: l.revisao,
    atualizadoEm: l.atualizadoEm ? iso(l.atualizadoEm) : null,
  };
}

/**
 * O espaço de trabalho pertence ao escritório; o usuário chega a ele pela sua filiação.
 * Toda consulta roda em `comEscritorio`, então o RLS do banco garante o isolamento mesmo
 * que um filtro falte aqui.
 */
export class EspacoTrabalhoRepositoryPostgres implements EspacoTrabalhoRepository {
  private readonly db: BancoDeDados;
  private readonly clock: Clock;
  constructor(db: BancoDeDados, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  ler(usuarioId: string) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return { ...VAZIO };
      const [l] = await tx.select().from(espacosTrabalho).where(eq(espacosTrabalho.escritorioId, escritorioId));
      return l ? paraEspaco(l) : { ...VAZIO };
    });
  }

  salvar(usuarioId: string, dados: Pick<EspacoTrabalho, "intimacoes" | "termos">, revisaoBase: number) {
    return comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) throw new AppError("nao_encontrado", "Sua conta não está ligada a nenhum escritório.");
      const valores = { intimacoes: dados.intimacoes, termos: dados.termos, atualizadoEm: this.clock.agora() };
      const [atualizado] = await tx
        .update(espacosTrabalho)
        .set({ ...valores, revisao: sql`${espacosTrabalho.revisao} + 1` })
        .where(and(eq(espacosTrabalho.escritorioId, escritorioId), eq(espacosTrabalho.revisao, revisaoBase)))
        .returning();
      if (atualizado) return paraEspaco(atualizado);

      const [atual] = await tx.select({ revisao: espacosTrabalho.revisao }).from(espacosTrabalho).where(eq(espacosTrabalho.escritorioId, escritorioId));
      if (!atual && revisaoBase === 0) {
        const [criado] = await tx.insert(espacosTrabalho).values({ escritorioId, ...valores, revisao: 1 }).returning();
        return paraEspaco(criado);
      }
      throw new AppError("conflito", "Seus dados foram alterados em outra aba ou dispositivo.", { revisaoAtual: atual?.revisao ?? 0 });
    });
  }

  /** Só apaga o espaço se o usuário for o único membro: os dados são do escritório, não da pessoa. */
  async excluir(usuarioId: string) {
    await comEscritorio(this.db, usuarioId, async (tx, escritorioId) => {
      if (!escritorioId) return;
      const [{ total }] = await tx.select({ total: count() }).from(membros).where(eq(membros.escritorioId, escritorioId));
      if (total <= 1) await tx.delete(espacosTrabalho).where(eq(espacosTrabalho.escritorioId, escritorioId));
    });
  }
}
