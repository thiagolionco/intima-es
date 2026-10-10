/**
 * Tabelas do PostgreSQL (Drizzle). Duas famílias:
 *
 * - Identidade (usuarios, sessoes, tokens, desafios, auditoria): consultadas antes de se saber
 *   o escritório (login, validação de sessão). Ficam com RLS ligado e sem política, então só o
 *   dono das tabelas (a conexão do app) as enxerga; nenhum outro papel do banco lê nada.
 * - Dados do escritório (escritorios, membros, espacos_trabalho): RLS forçado por
 *   `escritorio_id`. O app só as acessa com o papel `sentinela_app` dentro de
 *   `comEscritorio` (contexto.ts). Políticas e papéis estão na migração 0001.
 */
import { bigserial, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

const instante = (nome: string) => timestamp(nome, { withTimezone: true, mode: "date" });

export const usuarios = pgTable("usuarios", {
  id: uuid("id").primaryKey(),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  escritorio: text("escritorio"),
  oab: text("oab"),
  senhaHash: text("senha_hash").notNull(),
  emailConfirmadoEm: instante("email_confirmado_em"),
  totpSegredo: text("totp_segredo"),
  totpAtivo: boolean("totp_ativo").notNull().default(false),
  totpUltimoPasso: integer("totp_ultimo_passo"),
  codigosRecuperacao: jsonb("codigos_recuperacao").$type<string[]>().notNull().default([]),
  tentativasFalhas: integer("tentativas_falhas").notNull().default(0),
  bloqueadoAte: instante("bloqueado_ate"),
  senhaAlteradaEm: instante("senha_alterada_em").notNull(),
  aceitouTermosEm: instante("aceitou_termos_em").notNull(),
  criadoEm: instante("criado_em").notNull(),
  atualizadoEm: instante("atualizado_em").notNull(),
});

export const sessoes = pgTable(
  "sessoes",
  {
    /** sha256 do token entregue no cookie. */
    id: text("id").primaryKey(),
    usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id, { onDelete: "cascade" }),
    criadaEm: instante("criada_em").notNull(),
    ultimoUsoEm: instante("ultimo_uso_em").notNull(),
    expiraEm: instante("expira_em").notNull(),
    lembrar: boolean("lembrar").notNull(),
    ip: text("ip").notNull(),
    userAgent: text("user_agent").notNull(),
  },
  (t) => [index("sessoes_usuario_idx").on(t.usuarioId), index("sessoes_expira_idx").on(t.expiraEm)],
);

export const tokensVerificacao = pgTable(
  "tokens_verificacao",
  {
    /** sha256 do token enviado por e-mail. */
    id: text("id").primaryKey(),
    usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id, { onDelete: "cascade" }),
    finalidade: text("finalidade").notNull().$type<"confirmar_email" | "redefinir_senha">(),
    expiraEm: instante("expira_em").notNull(),
    criadoEm: instante("criado_em").notNull(),
  },
  (t) => [index("tokens_usuario_idx").on(t.usuarioId)],
);

export const desafiosDoisFatores = pgTable("desafios_dois_fatores", {
  id: text("id").primaryKey(),
  usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id, { onDelete: "cascade" }),
  lembrar: boolean("lembrar").notNull(),
  tentativas: integer("tentativas").notNull(),
  expiraEm: instante("expira_em").notNull(),
});

export const auditoria = pgTable(
  "auditoria",
  {
    id: text("id").primaryKey(),
    /** Ordem de gravação: desempata eventos no mesmo milissegundo. */
    ordem: bigserial("ordem", { mode: "number" }).notNull(),
    usuarioId: uuid("usuario_id").notNull(),
    tipo: text("tipo").notNull(),
    em: instante("em").notNull(),
    ip: text("ip").notNull(),
    userAgent: text("user_agent").notNull(),
    detalhe: text("detalhe"),
  },
  (t) => [index("auditoria_usuario_ordem_idx").on(t.usuarioId, t.ordem)],
);

export const escritorios = pgTable("escritorios", {
  id: uuid("id").primaryKey(),
  nome: text("nome").notNull(),
  criadoEm: instante("criado_em").notNull(),
});

export const membros = pgTable(
  "membros",
  {
    escritorioId: uuid("escritorio_id").notNull().references(() => escritorios.id, { onDelete: "cascade" }),
    usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id, { onDelete: "cascade" }),
    papel: text("papel").notNull().$type<"dono" | "advogado" | "leitura">(),
    criadoEm: instante("criado_em").notNull(),
  },
  (t) => [primaryKey({ columns: [t.escritorioId, t.usuarioId] }), index("membros_usuario_idx").on(t.usuarioId)],
);

export const espacosTrabalho = pgTable("espacos_trabalho", {
  escritorioId: uuid("escritorio_id").primaryKey().references(() => escritorios.id, { onDelete: "cascade" }),
  intimacoes: jsonb("intimacoes").notNull().default([]),
  termos: jsonb("termos").notNull().default([]),
  revisao: integer("revisao").notNull().default(0),
  atualizadoEm: instante("atualizado_em"),
});
