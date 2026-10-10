import { AsyncLocalStorage } from "node:async_hooks";
import { CadastroService } from "./auth/services/cadastro.ts";
import { AutenticacaoService } from "./auth/services/autenticacao.ts";
import { ContaService } from "./auth/services/conta.ts";
import type { DependenciasAuth, Links } from "./auth/services/dependencias.ts";
import { DoisFatoresService } from "./auth/services/dois-fatores.ts";
import { RecuperacaoSenhaService } from "./auth/services/recuperacao-senha.ts";
import { SessaoService } from "./auth/services/sessoes.ts";
import { DIA, HORA, relogioDoSistema } from "./core/clock.ts";
import { type Configuracao, lerConfiguracao } from "./config.ts";
import { ArmazenamentoEmArquivo } from "./infra/armazenamento.ts";
import { CaixaDeSaidaLocal, EnviadorResend, EnviadorSmtp } from "./infra/email/enviadores.ts";
import { NotificacoesPorEmail } from "./infra/email/notificacoes.ts";
import type { EnviadorDeEmail } from "./infra/email/ports.ts";
import { HashScrypt } from "./infra/hash-scrypt.ts";
import { LimitadorEmMemoria } from "./infra/limitador.ts";
import {
  AuditoriaDocumentos,
  DesafioRepositoryDocumentos,
  SessaoRepositoryDocumentos,
  TokenRepositoryDocumentos,
  UsuarioRepositoryDocumentos,
} from "./infra/repositorios.ts";
import { Totp } from "./infra/totp.ts";
import { EspacoTrabalhoRepositoryDocumentos, EspacoTrabalhoService } from "./workspace/espaco-trabalho.ts";

/** Origem da requisição atual, usada nos links dos e-mails quando APP_URL não está definida. */
export const origemDaRequisicao = new AsyncLocalStorage<string>();

let avisouSemAppUrl = false;

function criarLinks(config: Configuracao): Links {
  const base = () => {
    if (config.urlApp) return config.urlApp;
    if (config.producao && !avisouSemAppUrl) {
      avisouSemAppUrl = true;
      console.warn("[auth] Defina APP_URL em produção: os links dos e-mails estão usando o cabeçalho Host da requisição.");
    }
    return origemDaRequisicao.getStore() ?? "http://localhost:3000";
  };
  const comEmail = (rota: string, email?: string) => `${base()}${rota}${email ? `?email=${encodeURIComponent(email)}` : ""}`;
  return {
    entrar: (email) => comEmail("/entrar", email),
    esqueciSenha: (email) => comEmail("/esqueci-a-senha", email),
    confirmarEmail: (token) => `${base()}/confirmar-email#token=${token}`,
    redefinirSenha: (token) => `${base()}/redefinir-senha#token=${token}`,
  };
}

function criarEnviador(config: Configuracao, caixa: CaixaDeSaidaLocal): EnviadorDeEmail {
  const { email } = config;
  if (email.provedor === "resend") {
    if (!email.resendChave) throw new Error("EMAIL_PROVIDER=resend exige RESEND_API_KEY.");
    return new EnviadorResend(email.resendChave, email.remetente);
  }
  if (email.provedor === "smtp") {
    if (!email.smtp.host) throw new Error("EMAIL_PROVIDER=smtp exige SMTP_HOST.");
    return new EnviadorSmtp({ ...email.smtp, remetente: email.remetente });
  }
  return caixa;
}

/**
 * Raiz de composição: o único lugar que conhece as implementações concretas.
 * Os serviços recebem apenas interfaces.
 */
function montar() {
  const config = lerConfiguracao();
  const clock = relogioDoSistema;
  const db = new ArmazenamentoEmArquivo(config.diretorioDados);
  const caixaDeSaida = new CaixaDeSaidaLocal(db, clock);

  const deps: DependenciasAuth = {
    usuarios: new UsuarioRepositoryDocumentos(db),
    sessoes: new SessaoRepositoryDocumentos(db, clock),
    tokens: new TokenRepositoryDocumentos(db, clock),
    desafios: new DesafioRepositoryDocumentos(db, clock),
    auditoria: new AuditoriaDocumentos(db, clock),
    hash: new HashScrypt(),
    limitador: new LimitadorEmMemoria(clock),
    segundoFator: new Totp(clock),
    notificacoes: new NotificacoesPorEmail(criarEnviador(config, caixaDeSaida)),
    clock,
    links: criarLinks(config),
    politicaSessao: { curtaInatividade: 8 * HORA, curtaAbsoluta: DIA, longaInatividade: 30 * DIA, longaAbsoluta: 90 * DIA },
    emissor2fa: config.emissor2fa,
  };
  const espacosRepo = new EspacoTrabalhoRepositoryDocumentos(db, clock);
  const sessoes = new SessaoService(deps);

  return {
    config,
    caixaDeSaida,
    sessoes,
    cadastro: new CadastroService(deps),
    autenticacao: new AutenticacaoService(deps, sessoes),
    recuperacao: new RecuperacaoSenhaService(deps),
    doisFatores: new DoisFatoresService(deps),
    conta: new ContaService(deps, espacosRepo),
    espacos: new EspacoTrabalhoService(espacosRepo),
    usuarios: deps.usuarios,
  };
}

export type Container = ReturnType<typeof montar>;

// Guardado no globalThis para sobreviver ao hot reload do `next dev` (o limitador é em memória).
const g = globalThis as typeof globalThis & { __containerIntimacoes?: Container };

export function container(): Container {
  return (g.__containerIntimacoes ??= montar());
}
