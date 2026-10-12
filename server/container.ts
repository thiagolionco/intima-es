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
import { type ArmazenamentoDocumentos, ArmazenamentoEmArquivo } from "./infra/armazenamento.ts";
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
import { conectar } from "./infra/postgres/conexao.ts";
import {
  ArmazenamentoPostgres,
  AuditoriaPostgres,
  DesafioRepositoryPostgres,
  EspacoTrabalhoRepositoryPostgres,
  SessaoRepositoryPostgres,
  TokenRepositoryPostgres,
  UsuarioRepositoryPostgres,
} from "./infra/postgres/repositorios.ts";
import { ProcessoRepositoryPostgres } from "./infra/postgres/processos.ts";
import { DocumentoRepositoryPostgres } from "./infra/postgres/documentos.ts";
import { ParecerRepositoryPostgres } from "./infra/postgres/pareceres.ts";
import { type ArmazenamentoArquivos, ArquivosEmDisco, ArquivosSupabase } from "./infra/arquivos.ts";
import { type DocumentoRepository, DocumentoRepositoryDocumentos, DocumentosService } from "./processos/documentos.ts";
import { type ParecerRepository, ParecerRepositoryDocumentos, PareceresService } from "./processos/pareceres.ts";
import { Totp } from "./infra/totp.ts";
import { type ProcessoRepository, ProcessoRepositoryDocumentos, ProcessosService } from "./processos/processos.ts";
import { type EspacoTrabalhoRepository, EspacoTrabalhoRepositoryDocumentos, EspacoTrabalhoService } from "./workspace/espaco-trabalho.ts";
import { criarBuscadorComunica } from "./comunica/cliente.ts";
import { novoId } from "./core/crypto.ts";
import { RondaComunica } from "./rondas/ronda-comunica.ts";
import { AvisosService } from "./avisos/avisos.ts";
import { AssinadorDeLinks } from "./core/assinatura.ts";
import { ResumidorClaude } from "./resumos/resumidor.ts";
import { ResumosService } from "./resumos/resumos.ts";
import { AgendaService } from "./agenda/agenda.ts";
import { ClienteGoogleHttp } from "./agenda/google.ts";
import { Cofre } from "./core/cofre.ts";
import { tokenAleatorio } from "./core/crypto.ts";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

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

/** LINKS_SECRET ou, na falta dele, um segredo gerado uma vez e guardado junto dos dados. */
function segredoDosLinks(config: Configuracao): string {
  if (config.segredoLinks) return config.segredoLinks;
  // Com banco, o disco do servidor pode ser descartado a cada publicação, e o segredo que assina os
  // links e cifra o token do Google se perderia junto. Em produção ele precisa vir do ambiente.
  if (config.urlBanco && config.producao) {
    throw new Error("Com DATABASE_URL em produção, defina LINKS_SECRET (32+ caracteres): o segredo gerado em arquivo não sobrevive a uma nova publicação.");
  }
  const arquivo = path.join(config.diretorioDados, "segredo-links");
  try {
    return readFileSync(arquivo, "utf8").trim();
  } catch {
    const novo = tokenAleatorio(48);
    mkdirSync(config.diretorioDados, { recursive: true, mode: 0o700 });
    writeFileSync(arquivo, novo, { mode: 0o600, flag: "wx" });
    return novo;
  }
}

let avisouArquivosEmDisco = false;

/** PDFs no Supabase Storage ou, sem ele, em disco (DATA_DIR/arquivos). */
function criarArquivos(config: Configuracao): ArmazenamentoArquivos {
  if (config.arquivos) return new ArquivosSupabase(config.arquivos);
  if (config.urlBanco && config.producao && !avisouArquivosEmDisco) {
    avisouArquivosEmDisco = true;
    console.warn("[documentos] Sem SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, os PDFs ficam no disco do servidor e se perdem numa nova publicação.");
  }
  return new ArquivosEmDisco(path.join(config.diretorioDados, "arquivos"));
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

/** Repositórios no PostgreSQL (com DATABASE_URL) ou em arquivos JSON (sem ela). */
function criarRepositorios(config: Configuracao, arquivos: ArmazenamentoEmArquivo) {
  const clock = relogioDoSistema;
  if (config.urlBanco) {
    const { db } = conectar(config.urlBanco);
    return {
      repositorios: {
        usuarios: new UsuarioRepositoryPostgres(db),
        sessoes: new SessaoRepositoryPostgres(db, clock),
        tokens: new TokenRepositoryPostgres(db, clock),
        desafios: new DesafioRepositoryPostgres(db, clock),
        auditoria: new AuditoriaPostgres(db, clock),
      },
      espacosRepo: new EspacoTrabalhoRepositoryPostgres(db, clock) as EspacoTrabalhoRepository,
      processosRepo: new ProcessoRepositoryPostgres(db) as ProcessoRepository,
      documentosRepo: new DocumentoRepositoryPostgres(db) as DocumentoRepository,
      pareceresRepo: new ParecerRepositoryPostgres(db) as ParecerRepository,
      // Conexão do Google Agenda e registro dos avisos enviados (não são do escritório: ficam fora do RLS).
      documentos: new ArmazenamentoPostgres(db) as ArmazenamentoDocumentos,
    };
  }
  return {
    repositorios: {
      usuarios: new UsuarioRepositoryDocumentos(arquivos),
      sessoes: new SessaoRepositoryDocumentos(arquivos, clock),
      tokens: new TokenRepositoryDocumentos(arquivos, clock),
      desafios: new DesafioRepositoryDocumentos(arquivos, clock),
      auditoria: new AuditoriaDocumentos(arquivos, clock),
    },
    espacosRepo: new EspacoTrabalhoRepositoryDocumentos(arquivos, clock) as EspacoTrabalhoRepository,
    processosRepo: new ProcessoRepositoryDocumentos(arquivos) as ProcessoRepository,
    documentosRepo: new DocumentoRepositoryDocumentos(arquivos) as DocumentoRepository,
    pareceresRepo: new ParecerRepositoryDocumentos(arquivos) as ParecerRepository,
    documentos: arquivos as ArmazenamentoDocumentos,
  };
}

/**
 * Raiz de composição: o único lugar que conhece as implementações concretas.
 * Os serviços recebem apenas interfaces.
 */
function montar() {
  const config = lerConfiguracao();
  const clock = relogioDoSistema;
  const arquivos = new ArmazenamentoEmArquivo(config.diretorioDados);
  // A caixa de saída de desenvolvimento fica sempre em arquivo, mesmo com Postgres.
  const caixaDeSaida = new CaixaDeSaidaLocal(arquivos, clock);
  const enviador = criarEnviador(config, caixaDeSaida);
  const { repositorios, espacosRepo, processosRepo, documentosRepo, pareceresRepo, documentos: db } = criarRepositorios(config, arquivos);

  const documentosArquivos = new DocumentosService({ repo: documentosRepo, processos: processosRepo, arquivos: criarArquivos(config), clock });
  const pareceres = new PareceresService({ repo: pareceresRepo, processos: processosRepo, clock });

  const deps: DependenciasAuth = {
    ...repositorios,
    hash: new HashScrypt(),
    limitador: new LimitadorEmMemoria(clock),
    segundoFator: new Totp(clock),
    notificacoes: new NotificacoesPorEmail(enviador),
    clock,
    links: criarLinks(config),
    politicaSessao: { curtaInatividade: 8 * HORA, curtaAbsoluta: DIA, longaInatividade: 30 * DIA, longaAbsoluta: 90 * DIA },
    emissor2fa: config.emissor2fa,
  };
  const sessoes = new SessaoService(deps);
  const segredo = segredoDosLinks(config);
  const assinador = new AssinadorDeLinks(segredo);
  const urlApp = () => config.urlApp ?? origemDaRequisicao.getStore() ?? "http://localhost:3000";
  const agenda = new AgendaService({
    google: config.google ? new ClienteGoogleHttp(config.google) : undefined,
    espacos: espacosRepo,
    documentos: db,
    cofre: new Cofre(segredo, "google-agenda"),
    assinador,
    clock,
    listarUsuarios: () => deps.usuarios.listarConfirmados(),
    urlApp,
  });
  const avisos = new AvisosService({
    espacos: espacosRepo,
    usuarios: deps.usuarios,
    enviador,
    registro: db,
    assinador,
    clock,
    urlApp,
  });
  const resumos = new ResumosService({
    espacos: espacosRepo,
    resumidor: config.resumos.chave ? new ResumidorClaude({ chave: config.resumos.chave, modelo: config.resumos.modelo }) : undefined,
    clock,
  });
  const rondaComunica = new RondaComunica({
    espacos: espacosRepo,
    listarUsuarios: () => deps.usuarios.listarConfirmados(),
    buscarPagina: criarBuscadorComunica({ base: config.comunica.url, timeoutMs: 40_000, urlApp: config.urlApp }),
    clock,
    novoId,
    // Com resumo ligado, o que a ronda trouxe já chega resumido.
    aoEncontrar: resumos.disponivel
      ? async (novas) => {
          const porConta = new Map<string, string[]>();
          for (const n of novas) porConta.set(n.usuarioId, [...(porConta.get(n.usuarioId) ?? []), n.intimacao.id]);
          for (const [usuarioId, ids] of porConta) await resumos.resumir(usuarioId, ids, 50);
        }
      : undefined,
  });

  return {
    config,
    caixaDeSaida,
    sessoes,
    cadastro: new CadastroService(deps),
    autenticacao: new AutenticacaoService(deps, sessoes),
    recuperacao: new RecuperacaoSenhaService(deps),
    doisFatores: new DoisFatoresService(deps),
    conta: new ContaService(
      deps,
      espacosRepo,
      async (id) => {
        await agenda.desconectar(id);
        await db.remover(`avisos/${id}`);
        await documentosArquivos.excluirDaConta(id);
        await pareceres.excluirDaConta(id);
        await processosRepo.excluirDoUsuario(id);
      },
      (id) => processosRepo.listar(id),
    ),
    processos: new ProcessosService(processosRepo, clock, {
      caminhosDoProcesso: (usuarioId, processoId) => documentosArquivos.caminhosDoProcesso(usuarioId, processoId),
      async aposExcluirProcesso(usuarioId, processoId, caminhos) {
        await pareceres.excluirDoProcesso(usuarioId, processoId);
        await documentosArquivos.aposExcluirProcesso(usuarioId, processoId, caminhos);
      },
    }),
    documentosProcesso: documentosArquivos,
    pareceres,
    espacos: new EspacoTrabalhoService(espacosRepo, (id) => agenda.agendar(id)),
    usuarios: deps.usuarios,
    rondaComunica,
    avisos,
    resumos,
    agenda,
    limitador: deps.limitador,
  };
}

export type Container = ReturnType<typeof montar>;

// Guardado no globalThis para sobreviver ao hot reload do `next dev` (o limitador é em memória).
const g = globalThis as typeof globalThis & { __containerIntimacoes?: Container };

export function container(): Container {
  return (g.__containerIntimacoes ??= montar());
}
