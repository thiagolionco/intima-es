import path from "node:path";

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
    diretorioDados: path.resolve(env.DATA_DIR || path.join(process.cwd(), ".data")),
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
    /** Resumo das intimações pela API da Anthropic. Sem chave, o Clepsa funciona sem resumos. */
    resumos: {
      chave: env.ANTHROPIC_API_KEY || undefined,
      modelo: env.ANTHROPIC_MODEL || "claude-opus-5-5",
    },
    /** Google Agenda (OAuth). Sem as duas chaves, a opção não aparece. */
    google: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } : undefined,
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
