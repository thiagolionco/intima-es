/**
 * Tabelas do PostgreSQL (Drizzle). Duas famílias:
 *
 * - Identidade (usuarios, sessoes, tokens, desafios, auditoria): consultadas antes de se saber
 *   o escritório (login, validação de sessão). Ficam com RLS ligado e sem política, então só o
 *   dono das tabelas (a conexão do app) as enxerga; nenhum outro papel do banco lê nada.
 * - Dados do escritório (escritorios, membros, espacos_trabalho, processos, processo_documentos, processo_pareceres,
 *   processo_analises, processo_movimentacoes, registro_cobertura): RLS forçado por
 *   `escritorio_id`. O app só as acessa com o papel `sentinela_app` dentro de
 *   `comEscritorio` (contexto.ts). Políticas e papéis estão nas migrações 0001, 0003 a 0008 e 0011 (0010 só acrescenta colunas).
 */
import { bigint, bigserial, boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { AreaAtuacao, FaseProcesso, TipoDemanda } from "../../../lib/processos.ts";
import type { MarcaItem, TipoEvento } from "../../../lib/fluxo/modelo.ts";

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
  administrador: boolean("administrador").notNull().default(false),
  desativadoEm: instante("desativado_em"),
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
  suspensoes: jsonb("suspensoes").notNull().default([]),
  /** Preferências do espaço (avisos, equipe). Nulo até a primeira gravação. */
  preferencias: jsonb("preferencias"),
  revisao: integer("revisao").notNull().default(0),
  atualizadoEm: instante("atualizado_em"),
});

/** Processos cadastrados pelo escritório. O número CNJ (só dígitos) é único dentro do escritório. */
export const processos = pgTable(
  "processos",
  {
    id: uuid("id").primaryKey(),
    escritorioId: uuid("escritorio_id").notNull().references(() => escritorios.id, { onDelete: "cascade" }),
    /** Fica vazio até o protocolo. */
    numero: text("numero"),
    fase: text("fase").notNull().default("triagem").$type<FaseProcesso>(),
    area: text("area").$type<AreaAtuacao>(),
    tipo: text("tipo").$type<TipoDemanda>(),
    dataAtendimento: date("data_atendimento", { mode: "string" }),
    dataInicio: date("data_inicio", { mode: "string" }),
    prescricao: date("prescricao", { mode: "string" }),
    dataProtocolo: date("data_protocolo", { mode: "string" }),
    comarca: text("comarca"),
    cliente: text("cliente").notNull(),
    parteContraria: text("parte_contraria"),
    polo: text("polo").notNull().$type<"ativo" | "passivo">(),
    tribunal: text("tribunal"),
    orgao: text("orgao"),
    classe: text("classe"),
    /** Em centavos. */
    valorCausa: bigint("valor_causa", { mode: "number" }),
    responsavelId: text("responsavel_id"),
    observacoes: text("observacoes"),
    criadoEm: instante("criado_em").notNull(),
    atualizadoEm: instante("atualizado_em").notNull(),
  },
  (t) => [unique("processos_escritorio_numero_key").on(t.escritorioId, t.numero)],
);

/** PDFs anexados aos processos: só os metadados; os bytes ficam no armazenamento de arquivos. */
export const processoDocumentos = pgTable(
  "processo_documentos",
  {
    id: uuid("id").primaryKey(),
    escritorioId: uuid("escritorio_id").notNull().references(() => escritorios.id, { onDelete: "cascade" }),
    processoId: uuid("processo_id").notNull().references(() => processos.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    tamanho: integer("tamanho").notNull(),
    /** sha256 do conteúdo. */
    hash: text("hash").notNull(),
    /** Caminho no armazenamento de arquivos. */
    caminho: text("caminho").notNull(),
    criadoEm: instante("criado_em").notNull(),
  },
  (t) => [unique("processo_documentos_processo_hash_key").on(t.processoId, t.hash), index("processo_documentos_escritorio_idx").on(t.escritorioId)],
);

/** Versões do parecer do processo: só se acrescenta, nunca se altera. */
export const processoPareceres = pgTable(
  "processo_pareceres",
  {
    id: uuid("id").primaryKey(),
    escritorioId: uuid("escritorio_id").notNull().references(() => escritorios.id, { onDelete: "cascade" }),
    processoId: uuid("processo_id").notNull().references(() => processos.id, { onDelete: "cascade" }),
    versao: integer("versao").notNull(),
    texto: text("texto").notNull(),
    /** Sem chave estrangeira: o parecer continua no processo se o autor sair do escritório. */
    autorId: uuid("autor_id").notNull(),
    autorNome: text("autor_nome").notNull(),
    criadoEm: instante("criado_em").notNull(),
  },
  (t) => [unique("processo_pareceres_processo_versao_key").on(t.processoId, t.versao), index("processo_pareceres_escritorio_idx").on(t.escritorioId)],
);

/** Análises de risco feitas pela IA: só se acrescenta, nunca se altera. */
export const processoAnalises = pgTable(
  "processo_analises",
  {
    id: uuid("id").primaryKey(),
    escritorioId: uuid("escritorio_id").notNull().references(() => escritorios.id, { onDelete: "cascade" }),
    processoId: uuid("processo_id").notNull().references(() => processos.id, { onDelete: "cascade" }),
    nivel: text("nivel").notNull(),
    /** Justificativa, pontos fortes e fracos (com documento e página) e os PDFs lidos. */
    resultado: jsonb("resultado").notNull(),
    modelo: text("modelo").notNull(),
    autorId: uuid("autor_id").notNull(),
    autorNome: text("autor_nome").notNull(),
    criadoEm: instante("criado_em").notNull(),
  },
  (t) => [index("processo_analises_processo_idx").on(t.processoId), index("processo_analises_escritorio_idx").on(t.escritorioId)],
);

/** Última consulta do processo no DataJud (CNJ): uma linha por processo, regravada a cada consulta. */
export const processoMovimentacoes = pgTable(
  "processo_movimentacoes",
  {
    processoId: uuid("processo_id")
      .primaryKey()
      .references(() => processos.id, { onDelete: "cascade" }),
    escritorioId: uuid("escritorio_id").notNull().references(() => escritorios.id, { onDelete: "cascade" }),
    consultadoEm: instante("consultado_em").notNull(),
    encontrado: boolean("encontrado").notNull(),
    atualizadoNoTribunal: instante("atualizado_no_tribunal"),
    /** Andamentos, do mais novo para o mais antigo. */
    movimentos: jsonb("movimentos").notNull(),
    erro: text("erro"),
    /** Último andamento, à parte para a lista de processos não ler a lista inteira. */
    ultimaEm: instante("ultima_em"),
    ultimaNome: text("ultima_nome"),
  },
  (t) => [index("processo_movimentacoes_escritorio_idx").on(t.escritorioId)],
);

/**
 * Livro de cobertura: o que a busca automática verificou no Comunica, por termo monitorado e dia
 * de disponibilização. O termo vive no JSON de `espacos_trabalho`, por isso `termo_id` é texto.
 */
export const registroCobertura = pgTable(
  "registro_cobertura",
  {
    escritorioId: uuid("escritorio_id").notNull().references(() => escritorios.id, { onDelete: "cascade" }),
    termoId: text("termo_id").notNull(),
    dia: date("dia", { mode: "string" }).notNull(),
    /** NAO_VERIFICADO, VERIFICADO_COM_RESULTADOS, VERIFICADO_SEM_RESULTADOS, PARCIAL ou FALHOU. */
    estado: text("estado").notNull(),
    lidos: integer("lidos").notNull(),
    esperados: integer("esperados"),
    latenciaMs: integer("latencia_ms"),
    erro: text("erro"),
    tentativas: integer("tentativas").notNull(),
    verificadoEm: instante("verificado_em").notNull(),
  },
  (t) => [primaryKey({ columns: [t.escritorioId, t.termoId, t.dia] }), index("registro_cobertura_dia_idx").on(t.escritorioId, t.dia)],
);

/**
 * Documentos soltos por chave (conexão do Google Agenda, registro de avisos enviados). Mesma ideia
 * dos arquivos de DATA_DIR. Não são do escritório: RLS ligado e sem política, como a identidade.
 */
export const documentos = pgTable("documentos", {
  chave: text("chave").primaryKey(),
  valor: jsonb("valor").notNull(),
  atualizadoEm: instante("atualizado_em").notNull().defaultNow(),
});

/** Estado de cada processo na Central de casos: desde quando está na etapa e o checklist marcado. */
export const processoFluxo = pgTable(
  "processo_fluxo",
  {
    processoId: uuid("processo_id").primaryKey().references(() => processos.id, { onDelete: "cascade" }),
    escritorioId: uuid("escritorio_id").notNull().references(() => escritorios.id, { onDelete: "cascade" }),
    etapa: text("etapa").notNull().$type<FaseProcesso>(),
    etapaDesde: instante("etapa_desde").notNull(),
    checklist: jsonb("checklist").notNull().$type<Record<string, MarcaItem>>(),
    /** Sobe a cada gravação (controle de concorrência otimista). */
    versao: integer("versao").notNull(),
    atualizadoEm: instante("atualizado_em").notNull(),
  },
  (t) => [index("processo_fluxo_escritorio_idx").on(t.escritorioId)],
);

/** Trilha de auditoria da Central: só se acrescenta, nunca se altera. */
export const processoEventos = pgTable(
  "processo_eventos",
  {
    id: uuid("id").primaryKey(),
    escritorioId: uuid("escritorio_id").notNull().references(() => escritorios.id, { onDelete: "cascade" }),
    processoId: uuid("processo_id").notNull().references(() => processos.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull().$type<TipoEvento>(),
    de: text("de").$type<FaseProcesso>(),
    para: text("para").$type<FaseProcesso>(),
    item: text("item"),
    motivo: text("motivo"),
    /** Sem chave estrangeira: o registro continua se o autor sair do escritório. */
    autorId: uuid("autor_id").notNull(),
    autorNome: text("autor_nome").notNull(),
    criadoEm: instante("criado_em").notNull(),
  },
  (t) => [index("processo_eventos_processo_idx").on(t.processoId, t.criadoEm), index("processo_eventos_escritorio_idx").on(t.escritorioId)],
);
