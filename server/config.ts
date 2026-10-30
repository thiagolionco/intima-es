import path from "node:path";
import { CHAVE_PUBLICA_DATAJUD } from "./processos/datajud.ts";

export type ProvedorEmail = "console" | "smtp" | "resend";

/** Lê e valida as variáveis de ambiente num único lugar. */
export function lerConfiguracao() {
  const env = process.env;
  const producao = env.NODE_ENV === "production";
  const provedor = (env.EMAIL_PROVIDER || "console").toLowerCase() as ProvedorEmail;
  if (!["console", "smtp", "resend"].includes(provedor)) throw new Error(`EMAIL_PROVIDER inválido: ${env.EMAIL_PROVIDER}`);

  return {
    producao,
    /** URL pública usada nos links dos e-mails. Sem ela, usamos a origem da requisição. */
    urlApp: env.APP_URL?.replace(/\/$/, ""),
    // Na Vercel só /tmp aceita escrita (e é apagado a cada instância): ali o banco é obrigatório.
    diretorioDados: path.resolve(env.DATA_DIR || (env.VERCEL ? "/tmp/clepsa" : path.join(process.cwd(), ".data"))),
    /** Com DATABASE_URL, os dados ficam no PostgreSQL; sem ela, em arquivos JSON em diretorioDados. */
    urlBanco: env.DATABASE_URL || undefined,
    email: {
      provedor,
      remetente: env.EMAIL_FROM || "Clepsa <no-reply@localhost>",
      resendChave: env.RESEND_API_KEY,
      smtp: {
        host: env.SMTP_HOST || "",
        porta: Number(env.SMTP_PORT || 587),
        seguro: env.SMTP_SECURE === "true",
        usuario: env.SMTP_USER,
        senha: env.SMTP_PASSWORD,
      },
    },
    /** Caixa de saída visível em /dev/caixa-de-saida (sempre em dev; em produção só se pedido). */
    caixaDeSaidaVisivel: !producao || env.ENABLE_DEV_OUTBOX === "true",
    emissor2fa: env.TOTP_ISSUER || "Clepsa",
    /** Segredo dos links assinados dos e-mails ("Já cumpri"). Sem ele, um é gerado e guardado em DATA_DIR. */
    segredoLinks: env.LINKS_SECRET || undefined,
    /**
     * PDFs dos processos no Supabase Storage (bucket privado). Sem SUPABASE_URL e
     * SUPABASE_SERVICE_ROLE_KEY, ficam em disco, em DATA_DIR/arquivos.
     */
    arquivos:
      env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
        ? { url: env.SUPABASE_URL, chave: env.SUPABASE_SERVICE_ROLE_KEY, bucket: env.SUPABASE_BUCKET || "processos" }
        : undefined,
    /** Bucket privado dos arquivos da biblioteca (PDF e Word), no mesmo Supabase. */
    bucketBiblioteca: env.SUPABASE_BUCKET_BIBLIOTECA || "biblioteca",
    /** Resumo das intimações pela API da Anthropic. Sem chave, o Clepsa funciona sem resumos. */
    resumos: {
      chave: env.ANTHROPIC_API_KEY || undefined,
      /** Modelo principal: parecer, risco, assistente, editor, revisões, citações, pesquisa. */
      modelo: env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      /** Modelo das tarefas simples: resumos de intimação, resumo de anotação, triagem e resposta de pedidos. */
      modeloSimples: env.ANTHROPIC_MODEL_SIMPLES || "claude-haiku-5-5",
    },
    /** Google Agenda (OAuth). Sem as duas chaves, a opção não aparece. */
    google: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } : undefined,
    /** Andamentos dos processos pela API pública do DataJud (CNJ). */
    datajud: {
      url: env.DATAJUD_API_URL || "https://api-publica.datajud.cnj.jus.br",
      chave: env.DATAJUD_API_KEY || CHAVE_PUBLICA_DATAJUD,
      /** Consulta diária automática. Como a do Comunica: ligada em produção; em dev só com RONDA_DATAJUD=ligada. */
      rondaLigada: env.RONDA_DATAJUD ? env.RONDA_DATAJUD === "ligada" : producao,
    },
    comunica: {
      url: env.COMUNICA_API_URL || "https://comunicaapi.pje.jus.br/api/v1/comunicacao",
      /**
       * Ronda automática por OAB e processo. Ligada por padrão em produção; em desenvolvimento só
       * com RONDA_COMUNICA=ligada, para não consultar o Comunica a cada `npm run dev`.
       */
      rondaLigada: env.RONDA_COMUNICA ? env.RONDA_COMUNICA === "ligada" : producao,
      rondaIntervaloHoras: Math.max(1, Number(env.RONDA_COMUNICA_INTERVALO_HORAS || 6) || 6),
      /** Segredo para um agendador externo chamar POST /api/rondas/comunica. */
      rondaToken: env.RONDA_TOKEN || undefined,
    },
  };
}

export type Configuracao = ReturnType<typeof lerConfiguracao>;
