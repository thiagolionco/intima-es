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
      remetente: env.EMAIL_FROM || "Controle de Intimações <no-reply@localhost>",
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
    emissor2fa: env.TOTP_ISSUER || "Controle de Intimações",
  };
}

export type Configuracao = ReturnType<typeof lerConfiguracao>;
