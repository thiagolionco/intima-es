import type { Clock } from "../../core/clock.ts";
import { novoId } from "../../core/crypto.ts";
import type { ArmazenamentoDocumentos } from "../armazenamento.ts";
import type { EmailRegistrado, EnviadorDeEmail, MensagemEmail } from "./ports.ts";

const LIMITE_CAIXA = 50;

/**
 * Caixa de saída de desenvolvimento: não envia nada para fora. Guarda os e-mails para a
 * página /dev/caixa-de-saida e escreve o link no terminal.
 */
export class CaixaDeSaidaLocal implements EnviadorDeEmail {
  readonly nome = "caixa de saída local (desenvolvimento)";
  private readonly db: ArmazenamentoDocumentos;
  private readonly clock: Clock;

  constructor(db: ArmazenamentoDocumentos, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  async enviar(m: MensagemEmail): Promise<void> {
    const registro: EmailRegistrado = { ...m, id: novoId(), enviadoEm: this.clock.agora().toISOString() };
    await this.db.alterar<EmailRegistrado[]>("caixa-de-saida", [], (lista) => ({ valor: [registro, ...lista].slice(0, LIMITE_CAIXA), resultado: undefined }));
    const links = m.texto.match(/https?:\/\/\S+/g) ?? [];
    console.info(`\n✉️  [e-mail] para ${m.para}: ${m.assunto}${links.length ? `\n   ${links.join("\n   ")}` : ""}\n`);
  }

  listar(): Promise<EmailRegistrado[]> {
    return this.db.ler<EmailRegistrado[]>("caixa-de-saida", []);
  }

  limpar(): Promise<void> {
    return this.db.remover("caixa-de-saida");
  }
}

/** Envio pela API HTTP do Resend (https://resend.com). Requer RESEND_API_KEY. */
export class EnviadorResend implements EnviadorDeEmail {
  readonly nome = "Resend";
  private readonly chave: string;
  private readonly remetente: string;

  constructor(chave: string, remetente: string) {
    this.chave = chave;
    this.remetente = remetente;
  }

  async enviar(m: MensagemEmail): Promise<void> {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.remetente, to: [m.para], subject: m.assunto, html: m.html, text: m.texto }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) throw new Error(`Resend respondeu ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  }
}

export interface ConfigSmtp {
  host: string;
  porta: number;
  seguro: boolean;
  usuario?: string;
  senha?: string;
  remetente: string;
}

/** Envio por SMTP (Gmail, Outlook/Office 365, Amazon SES, servidor próprio…). */
export class EnviadorSmtp implements EnviadorDeEmail {
  readonly nome = "SMTP";
  private readonly config: ConfigSmtp;

  constructor(config: ConfigSmtp) {
    this.config = config;
  }

  async enviar(m: MensagemEmail): Promise<void> {
    const nodemailer = await import("nodemailer");
    const transporte = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.porta,
      secure: this.config.seguro,
      auth: this.config.usuario ? { user: this.config.usuario, pass: this.config.senha } : undefined,
    });
    await transporte.sendMail({ from: this.config.remetente, to: m.para, subject: m.assunto, html: m.html, text: m.texto });
  }
}
