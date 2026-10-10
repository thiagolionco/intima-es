import { rotuloDispositivo } from "../../../lib/auth/dispositivo.ts";
import type { Usuario } from "../../auth/model.ts";
import type { NotificacoesDeConta } from "../../auth/ports.ts";
import type { EnviadorDeEmail, MensagemEmail } from "./ports.ts";

const PRODUTO = "Controle de Intimações";

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

interface Conteudo {
  assunto: string;
  titulo: string;
  paragrafos: string[];
  botao?: { rotulo: string; url: string };
  rodape?: string;
}

/** Monta um e-mail transacional com HTML compatível com clientes antigos (tabelas, CSS inline). */
export function montarEmail(para: string, c: Conteudo): MensagemEmail {
  const ps = c.paragrafos.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#334155">${escapar(p)}</p>`).join("");
  const botao = c.botao
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 24px"><tr><td style="border-radius:8px;background:#2147ed">
         <a href="${escapar(c.botao.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escapar(c.botao.rotulo)}</a>
       </td></tr></table>
       <p style="margin:0 0 16px;font-size:12px;line-height:18px;color:#64748b">Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="word-break:break-all;color:#2147ed">${escapar(c.botao.url)}</span></p>`
    : "";
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
      <tr><td style="background:#0f172a;padding:20px 28px"><span style="font-size:15px;font-weight:700;color:#ffffff">⚖️ ${PRODUTO}</span></td></tr>
      <tr><td style="padding:32px 28px 12px">
        <h1 style="margin:0 0 20px;font-size:22px;line-height:30px;color:#0f172a">${escapar(c.titulo)}</h1>
        ${ps}${botao}
      </td></tr>
      <tr><td style="padding:16px 28px 28px;border-top:1px solid #f1f5f9;font-size:12px;line-height:18px;color:#94a3b8">
        ${escapar(c.rodape ?? "Você recebeu esta mensagem porque há uma conta associada a este e-mail. Se não foi você, ignore-a com segurança.")}
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  const texto = [c.titulo, "", ...c.paragrafos, ...(c.botao ? ["", `${c.botao.rotulo}: ${c.botao.url}`] : []), "", c.rodape ?? ""].join("\n").trim();
  return { para, assunto: c.assunto, html, texto };
}

function quando(): string {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short" });
}

function primeiroNome(u: Usuario) {
  return u.nome.split(/\s+/)[0] || u.nome;
}

/** Implementação de NotificacoesDeConta por e-mail; o transporte é injetado. */
export class NotificacoesPorEmail implements NotificacoesDeConta {
  private readonly enviador: EnviadorDeEmail;

  constructor(enviador: EnviadorDeEmail) {
    this.enviador = enviador;
  }

  confirmarEmail(u: Usuario, link: string) {
    return this.enviador.enviar(
      montarEmail(u.email, {
        assunto: `Confirme seu e-mail · ${PRODUTO}`,
        titulo: `Bem-vindo(a), ${primeiroNome(u)}!`,
        paragrafos: ["Sua conta foi criada. Para ativá-la e acessar seu espaço de trabalho, confirme que este e-mail é seu.", "O link vale por 24 horas e só pode ser usado uma vez."],
        botao: { rotulo: "Confirmar e-mail", url: link },
      }),
    );
  }

  redefinirSenha(u: Usuario, link: string) {
    return this.enviador.enviar(
      montarEmail(u.email, {
        assunto: `Redefinição de senha · ${PRODUTO}`,
        titulo: "Redefinir sua senha",
        paragrafos: [`Olá, ${primeiroNome(u)}. Recebemos um pedido para redefinir a senha da sua conta em ${quando()}.`, "O link vale por 30 minutos. Ao redefinir, todas as sessões abertas serão encerradas."],
        botao: { rotulo: "Criar nova senha", url: link },
        rodape: "Se você não pediu a redefinição, ignore este e-mail: sua senha atual continua valendo.",
      }),
    );
  }

  contaJaExiste(u: Usuario, linkEntrar: string, linkRedefinir: string) {
    return this.enviador.enviar(
      montarEmail(u.email, {
        assunto: `Tentativa de cadastro com seu e-mail · ${PRODUTO}`,
        titulo: "Você já tem uma conta",
        paragrafos: [`Olá, ${primeiroNome(u)}. Alguém tentou criar uma nova conta com este e-mail em ${quando()}, mas ele já está cadastrado.`, `Se foi você, basta entrar. Se esqueceu a senha, redefina por aqui: ${linkRedefinir}`],
        botao: { rotulo: "Entrar na minha conta", url: linkEntrar },
      }),
    );
  }

  senhaAlterada(u: Usuario, ctx: { ip: string; userAgent: string }) {
    return this.enviador.enviar(
      montarEmail(u.email, {
        assunto: `Sua senha foi alterada · ${PRODUTO}`,
        titulo: "Senha alterada",
        paragrafos: [`A senha da sua conta foi alterada em ${quando()} (${rotuloDispositivo(ctx.userAgent)}, IP ${ctx.ip}).`, "As outras sessões abertas foram encerradas por segurança.", "Se não foi você, redefina a senha imediatamente e revise a atividade da conta."],
      }),
    );
  }

  novoAcesso(u: Usuario, ctx: { ip: string; userAgent: string }) {
    return this.enviador.enviar(
      montarEmail(u.email, {
        assunto: `Novo acesso à sua conta · ${PRODUTO}`,
        titulo: "Novo dispositivo conectado",
        paragrafos: [`Detectamos um acesso a partir de um dispositivo novo: ${rotuloDispositivo(ctx.userAgent)}, IP ${ctx.ip}, em ${quando()}.`, "Se foi você, nada a fazer. Se não reconhece este acesso, troque sua senha e encerre a sessão em Minha conta › Sessões."],
      }),
    );
  }

  doisFatoresAlterado(u: Usuario, ativo: boolean) {
    return this.enviador.enviar(
      montarEmail(u.email, {
        assunto: `Verificação em duas etapas ${ativo ? "ativada" : "desativada"} · ${PRODUTO}`,
        titulo: ativo ? "Verificação em duas etapas ativada" : "Verificação em duas etapas desativada",
        paragrafos: ativo
          ? ["A partir de agora, além da senha, pediremos um código do seu aplicativo autenticador ao entrar.", "Guarde os códigos de recuperação em local seguro: eles são a única forma de entrar se você perder o celular."]
          : [`A verificação em duas etapas foi desativada em ${quando()}. Sua conta volta a ser protegida apenas pela senha.`, "Se não foi você, troque sua senha imediatamente."],
      }),
    );
  }

  contaBloqueada(u: Usuario, ate: Date, linkRedefinir: string) {
    return this.enviador.enviar(
      montarEmail(u.email, {
        assunto: `Acesso bloqueado temporariamente · ${PRODUTO}`,
        titulo: "Muitas tentativas de senha incorretas",
        paragrafos: [
          `Bloqueamos novas tentativas de login até ${ate.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", timeStyle: "short" })} (horário de Brasília) para proteger sua conta.`,
          "Se foi você, aguarde ou redefina a senha. Se não foi, recomendamos ativar a verificação em duas etapas.",
        ],
        botao: { rotulo: "Redefinir senha", url: linkRedefinir },
      }),
    );
  }
}
