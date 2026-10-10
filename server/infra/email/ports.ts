export interface MensagemEmail {
  para: string;
  assunto: string;
  html: string;
  texto: string;
}

/** Transporte de e-mail (SMTP, Resend, caixa de saída local…). Só sabe entregar mensagens. */
export interface EnviadorDeEmail {
  readonly nome: string;
  enviar(mensagem: MensagemEmail): Promise<void>;
}

/** E-mail guardado pela caixa de saída de desenvolvimento. */
export interface EmailRegistrado extends MensagemEmail {
  id: string;
  enviadoEm: string;
}
