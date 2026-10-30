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
import { FluxoRepositoryPostgres } from "./infra/postgres/fluxo.ts";
import { type FluxoRepository, FluxoRepositoryDocumentos, FluxoService } from "./fluxo/fluxo.ts";
import { motorPadrao } from "../lib/fluxo/motor.ts";
import { DocumentoRepositoryPostgres } from "./infra/postgres/documentos.ts";
import { ParecerRepositoryPostgres } from "./infra/postgres/pareceres.ts";
import { AnaliseRepositoryPostgres } from "./infra/postgres/analises.ts";
import { MovimentacaoRepositoryPostgres } from "./infra/postgres/movimentacoes.ts";
import { CoberturaRepositoryPostgres } from "./infra/postgres/cobertura.ts";
import { DiretorioDeContasPostgres } from "./infra/postgres/diretorio.ts";
import { EscritorioRepositoryPostgres } from "./infra/postgres/escritorio.ts";
import { type EscritorioRepository, EscritorioRepositoryDocumentos, EscritorioService } from "./escritorio/escritorio.ts";
import { AdministracaoService, type DiretorioDeContas, DiretorioDeContasDocumentos, ehAdministrador } from "./admin/administracao.ts";
import { type CoberturaRepository, CoberturaRepositoryDocumentos, CoberturaService } from "./rondas/cobertura.ts";
import { type MovimentacaoRepository, MovimentacaoRepositoryDocumentos, MovimentacoesService } from "./processos/movimentacoes.ts";
import { criarConsultaDataJud } from "./processos/datajud.ts";
import { type ArmazenamentoArquivos, ArquivosEmDisco, ArquivosSupabase } from "./infra/arquivos.ts";
import { type DocumentoRepository, DocumentoRepositoryDocumentos, DocumentosService } from "./processos/documentos.ts";
import { type ParecerRepository, ParecerRepositoryDocumentos, PareceresService } from "./processos/pareceres.ts";
import { type AnaliseRepository, AnaliseRepositoryDocumentos, AnalisesService, LIMITES_ANALISE } from "./processos/analises.ts";
import { AnalisadorClaude } from "./processos/analisador-claude.ts";
import { LIMITES_REDACAO, RedacaoParecerService } from "./processos/redacao-parecer.ts";
import { RedatorClaude } from "./processos/redator-claude.ts";
import { type BibliotecaRepository, BibliotecaRepositoryDocumentos, BibliotecaService } from "./biblioteca/biblioteca.ts";
import { BibliotecaRepositoryPostgres } from "./infra/postgres/biblioteca.ts";
import { Totp } from "./infra/totp.ts";
import { type RegistrosRepository, RegistrosRepositoryDocumentos } from "./registros/registros.ts";
import { RegistrosRepositoryPostgres } from "./infra/postgres/registros.ts";
import { IaClaude } from "./ia/ia.ts";
import { PadroesService } from "./ia/padroes.ts";
import { ContextoProcesso } from "./ia/contexto-processo.ts";
import { CitacoesService } from "./ia/citacoes.ts";
import { LinhaDoTempoService } from "./ia/linha-do-tempo.ts";
import { ProvidenciasService } from "./ia/providencias.ts";
import { RevisoesService } from "./ia/revisoes.ts";
import { EditorIaService } from "./ia/editor.ts";
import { PesquisaService } from "./ia/pesquisa.ts";
import { CalendarioOficialService } from "./prazos/calendario-oficial.ts";
import { AgenteService } from "./ia/agente.ts";
import { FluxosIaService } from "./ia/fluxos.ts";
import { PedidosService } from "./ia/pedidos.ts";
import { PortalService } from "./ia/portal.ts";
import { MonitorService } from "./ia/monitor.ts";
import { MedidorUsoIa, type UsoIaRepository, UsoIaRepositoryDocumentos } from "./ia/uso.ts";
import { UsoIaRepositoryPostgres } from "./infra/postgres/uso-ia.ts";
import { type ProcessoRepository, ProcessoRepositoryDocumentos, ProcessosService } from "./processos/processos.ts";
import { type EspacoTrabalhoRepository, EspacoTrabalhoRepositoryDocumentos, EspacoTrabalhoService } from "./workspace/espaco-trabalho.ts";
import { criarBuscadorComunica } from "./comunica/cliente.ts";
import { novoId } from "./core/crypto.ts";
import { AppError } from "./core/errors.ts";
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
    convite: (token) => `${base()}/convite#token=${token}`,
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

/** PDFs no Supabase Storage ou, sem ele, em disco (DATA_DIR/arquivos). `bucket` troca o bucket padrão. */
function criarArquivos(config: Configuracao, bucket?: string): ArmazenamentoArquivos {
  if (config.arquivos) return new ArquivosSupabase({ ...config.arquivos, ...(bucket ? { bucket } : {}) });
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
    const processosPg = new ProcessoRepositoryPostgres(db);
    return {
      repositorios: {
        usuarios: new UsuarioRepositoryPostgres(db),
        sessoes: new SessaoRepositoryPostgres(db, clock),
        tokens: new TokenRepositoryPostgres(db, clock),
        desafios: new DesafioRepositoryPostgres(db, clock),
        auditoria: new AuditoriaPostgres(db, clock),
      },
      espacosRepo: new EspacoTrabalhoRepositoryPostgres(db, clock) as EspacoTrabalhoRepository,
      processosRepo: processosPg as ProcessoRepository,
      fluxoRepo: new FluxoRepositoryPostgres(db, (u, id) => processosPg.porId(u, id)) as FluxoRepository,
      documentosRepo: new DocumentoRepositoryPostgres(db) as DocumentoRepository,
      bibliotecaRepo: new BibliotecaRepositoryPostgres(db) as BibliotecaRepository,
      registrosRepo: new RegistrosRepositoryPostgres(db) as RegistrosRepository,
      pareceresRepo: new ParecerRepositoryPostgres(db) as ParecerRepository,
      analisesRepo: new AnaliseRepositoryPostgres(db) as AnaliseRepository,
      movimentacoesRepo: new MovimentacaoRepositoryPostgres(db) as MovimentacaoRepository,
      coberturaRepo: new CoberturaRepositoryPostgres(db, clock) as CoberturaRepository,
      diretorio: new DiretorioDeContasPostgres(db) as DiretorioDeContas,
      escritorioRepo: new EscritorioRepositoryPostgres(db) as EscritorioRepository,
      usoIaRepo: new UsoIaRepositoryPostgres(db) as UsoIaRepository,
      // Conexão do Google Agenda e registro dos avisos enviados (não são do escritório: ficam fora do RLS).
      documentos: new ArmazenamentoPostgres(db) as ArmazenamentoDocumentos,
    };
  }
  const processosDoc = new ProcessoRepositoryDocumentos(arquivos);
  return {
    repositorios: {
      usuarios: new UsuarioRepositoryDocumentos(arquivos),
      sessoes: new SessaoRepositoryDocumentos(arquivos, clock),
      tokens: new TokenRepositoryDocumentos(arquivos, clock),
      desafios: new DesafioRepositoryDocumentos(arquivos, clock),
      auditoria: new AuditoriaDocumentos(arquivos, clock),
    },
    espacosRepo: new EspacoTrabalhoRepositoryDocumentos(arquivos, clock) as EspacoTrabalhoRepository,
    processosRepo: processosDoc as ProcessoRepository,
    fluxoRepo: new FluxoRepositoryDocumentos(arquivos, processosDoc) as FluxoRepository,
    documentosRepo: new DocumentoRepositoryDocumentos(arquivos) as DocumentoRepository,
    bibliotecaRepo: new BibliotecaRepositoryDocumentos(arquivos) as BibliotecaRepository,
    registrosRepo: new RegistrosRepositoryDocumentos(arquivos) as RegistrosRepository,
    pareceresRepo: new ParecerRepositoryDocumentos(arquivos) as ParecerRepository,
    analisesRepo: new AnaliseRepositoryDocumentos(arquivos) as AnaliseRepository,
    movimentacoesRepo: new MovimentacaoRepositoryDocumentos(arquivos) as MovimentacaoRepository,
    coberturaRepo: new CoberturaRepositoryDocumentos(arquivos, clock) as CoberturaRepository,
    diretorio: new DiretorioDeContasDocumentos(arquivos) as DiretorioDeContas,
    escritorioRepo: new EscritorioRepositoryDocumentos(new UsuarioRepositoryDocumentos(arquivos)) as EscritorioRepository,
    usoIaRepo: new UsoIaRepositoryDocumentos({
      db: arquivos,
      clock,
      // Sem Postgres, cada conta é o próprio escritório (como no diretório de contas).
      nomeDoEscritorio: async (id) => {
        const u = await new UsuarioRepositoryDocumentos(arquivos).porId(id);
        return u?.escritorio?.trim() || u?.nome || "Conta removida";
      },
      ehAdministrador: async (id) => ehAdministrador(await new UsuarioRepositoryDocumentos(arquivos).porId(id)),
    }) as UsoIaRepository,
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
  const { repositorios, espacosRepo, processosRepo, fluxoRepo, documentosRepo, bibliotecaRepo, registrosRepo, pareceresRepo, analisesRepo, movimentacoesRepo, coberturaRepo, diretorio, escritorioRepo, usoIaRepo, documentos: db } = criarRepositorios(config, arquivos);

  const documentosArquivos = new DocumentosService({ repo: documentosRepo, processos: processosRepo, arquivos: criarArquivos(config), clock });
  const pareceres = new PareceresService({ repo: pareceresRepo, processos: processosRepo, clock });
  const biblioteca = new BibliotecaService({ repo: bibliotecaRepo, arquivos: criarArquivos(config, config.bucketBiblioteca), clock });
  const fluxo = new FluxoService({ repo: fluxoRepo, processos: processosRepo, motor: motorPadrao, clock });
  // Ferramentas de IA novas: mesma chave dos resumos; sem ANTHROPIC_API_KEY, cada uma se desliga.
  // Toda chamada à API da Anthropic anota os tokens gastos no escritório de quem pediu.
  const { anotar: anotarUso } = new MedidorUsoIa({ repo: usoIaRepo, clock });
  const ia = config.resumos.chave ? new IaClaude({ chave: config.resumos.chave, modelo: config.resumos.modelo, modeloSimples: config.resumos.modeloSimples, anotarUso }) : undefined;
  const padroes = new PadroesService({ repo: registrosRepo, clock });
  const contextoProcesso = new ContextoProcesso({ processos: processosRepo, documentos: documentosArquivos });

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
  const escritorio = new EscritorioService({
    repo: escritorioRepo,
    usuarios: deps.usuarios,
    espacos: espacosRepo,
    auditoria: deps.auditoria,
    hash: deps.hash,
    limitador: deps.limitador,
    enviador,
    clock,
    links: deps.links,
    convitesDisponiveis: !!config.urlBanco,
  });
  const analises = new AnalisesService({
    repo: analisesRepo,
    processos: processosRepo,
    documentos: documentosArquivos,
    // Mesma chave dos resumos: sem ANTHROPIC_API_KEY, só a análise fica desligada.
    analisador: config.resumos.chave ? new AnalisadorClaude({ chave: config.resumos.chave, modelo: config.resumos.modelo, anotarUso }) : undefined,
    clock,
    limitar: (usuarioId) => deps.limitador.consumir(`analise-risco:${usuarioId}`, LIMITES_ANALISE.porDia, DIA),
    padroes: (usuarioId) => padroes.instrucoes(usuarioId, "risco"),
  });
  const redacaoParecer = new RedacaoParecerService({
    processos: processosRepo,
    documentos: documentosArquivos,
    biblioteca,
    pareceres,
    analises,
    redator: config.resumos.chave ? new RedatorClaude({ chave: config.resumos.chave, modelo: config.resumos.modelo, anotarUso }) : undefined,
    limitar: (usuarioId) => deps.limitador.consumir(`parecer-ia:${usuarioId}`, LIMITES_REDACAO.porDia, DIA),
    padroes: (usuarioId) => padroes.instrucoes(usuarioId, "parecer"),
  });
  const movimentacoes = new MovimentacoesService({
    repo: movimentacoesRepo,
    processos: processosRepo,
    consultar: criarConsultaDataJud({ base: config.datajud.url, chave: config.datajud.chave }),
    clock,
    limitar: (usuarioId) => deps.limitador.consumir(`datajud:${usuarioId}`, 60, HORA),
    listarUsuarios: () => deps.usuarios.listarConfirmados(),
    pausaMs: 1500,
  });
  // Teto comum por conta para as ferramentas novas de IA (cada uma também tem o seu).
  const limiteIa = (nome: string, porDia: number) => (usuarioId: string) => {
    deps.limitador.consumir(`ia-total:${usuarioId}`, 300, DIA);
    deps.limitador.consumir(`${nome}:${usuarioId}`, porDia, DIA);
  };
  const citacoes = new CitacoesService({ repo: registrosRepo, biblioteca, contexto: contextoProcesso, padroes, ia, clock, limitar: limiteIa("citacoes", 60) });
  const linhaDoTempo = new LinhaDoTempoService({ repo: registrosRepo, contexto: contextoProcesso, padroes, ia, clock, limitar: limiteIa("linha-do-tempo", 40) });
  const providencias = new ProvidenciasService({ repo: registrosRepo, contexto: contextoProcesso, padroes, ia, clock, limitar: limiteIa("providencias", 40) });
  const revisoes = new RevisoesService({ repo: registrosRepo, processos: processosRepo, contexto: contextoProcesso, padroes, ia, clock, limitar: limiteIa("revisao", 200) });
  const editorIa = new EditorIaService({ contexto: contextoProcesso, padroes, ia, limitar: limiteIa("editor", 80) });
  const pesquisa = new PesquisaService({ padroes, ia, limitar: limiteIa("pesquisa", 60) });
  const calendarioOficial = new CalendarioOficialService({ ia, clock, limitar: limiteIa("calendario-oficial", 30) });
  const agente = new AgenteService({
    repo: registrosRepo,
    contexto: contextoProcesso,
    padroes,
    ferramentas: { analises, linhaDoTempo, providencias, pesquisa, redacao: redacaoParecer, pareceres, citacoes, movimentacoes },
    ia,
    clock,
    limitar: limiteIa("assistente", 60),
  });
  const fluxosIa = new FluxosIaService({
    repo: registrosRepo,
    processos: processosRepo,
    contexto: contextoProcesso,
    padroes,
    revisoes,
    pesquisa,
    citacoes,
    biblioteca,
    ia,
    clock,
    limitar: limiteIa("fluxos", 100),
  });
  const processosServico = new ProcessosService(processosRepo, clock, {
    caminhosDoProcesso: (usuarioId, processoId) => documentosArquivos.caminhosDoProcesso(usuarioId, processoId),
    async aposExcluirProcesso(usuarioId, processoId, caminhos) {
      await pareceres.excluirDoProcesso(usuarioId, processoId);
      await fluxo.excluirDoProcesso(usuarioId, processoId);
      await analises.excluirDoProcesso(usuarioId, processoId);
      await movimentacoes.excluirDoProcesso(usuarioId, processoId);
      await registrosRepo.excluirDoProcesso(usuarioId, processoId);
      await documentosArquivos.aposExcluirProcesso(usuarioId, processoId, caminhos);
    },
  }, escritorio, fluxo);
  const nomeDoEscritorio = async (usuarioId: string) => (await escritorioRepo.doUsuario(usuarioId))?.nome || "Escritório";
  const pedidos = new PedidosService({
    repo: registrosRepo,
    chaves: db,
    padroes,
    ia,
    clock,
    limitar: (chave, limite, janela) => deps.limitador.consumir(chave, limite, janela),
    criarProcesso: async (usuarioId, dados) => processosServico.criar(usuarioId, dados),
  });
  const portal = new PortalService({
    repo: registrosRepo,
    chaves: db,
    processos: processosRepo,
    documentos: documentosArquivos,
    movimentacoes,
    linhaDoTempo,
    pedidos,
    nomeDoEscritorio,
    clock,
    limitar: (chave, limite, janela) => deps.limitador.consumir(chave, limite, janela),
  });
  const monitor = new MonitorService({
    repo: registrosRepo,
    processos: processosRepo,
    padroes,
    ia,
    clock,
    listarUsuarios: () => deps.usuarios.listarConfirmados(),
    escritorioDe: (id) => escritorio.escritorioDe(id),
  });
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
    papelDe: (id) => escritorio.papelDe(id),
    membros: async (id) => (await escritorioRepo.membros(id)).map((m) => m.usuarioId),
    usuarios: deps.usuarios,
    enviador,
    registro: db,
    assinador,
    clock,
    urlApp,
  });
  const resumos = new ResumosService({
    espacos: espacosRepo,
    resumidor: config.resumos.chave ? new ResumidorClaude({ chave: config.resumos.chave, modelo: config.resumos.modeloSimples, anotarUso }) : undefined,
    clock,
  });
  const rondaComunica = new RondaComunica({
    espacos: espacosRepo,
    listarUsuarios: () => deps.usuarios.listarConfirmados(),
    escritorioDe: (id) => escritorio.escritorioDe(id),
    buscarPagina: criarBuscadorComunica({ base: config.comunica.url, timeoutMs: 40_000, urlApp: config.urlApp }),
    clock,
    novoId,
    cobertura: coberturaRepo,
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
        // Os dados são do escritório: ele não pode ficar sem dono enquanto houver mais gente nele.
        const membros = await escritorioRepo.membros(id);
        const eu = membros.find((m) => m.usuarioId === id);
        if (eu?.papel === "dono" && membros.length > 1 && !membros.some((m) => m.usuarioId !== id && m.papel === "dono")) {
          throw new AppError("conflito", "Você é o único dono de um escritório com outras pessoas. Em Equipe, torne alguém dono (ou tire as outras pessoas) antes de excluir sua conta.");
        }
      },
      async (id) => {
        await agenda.desconectar(id);
        await db.remover(`avisos/${id}`);
        await documentosArquivos.excluirDaConta(id);
        await biblioteca.excluirDaConta(id);
        await pareceres.excluirDaConta(id);
        await fluxo.excluirDaConta(id);
        await analises.excluirDaConta(id);
        await movimentacoes.excluirDaConta(id);
        await registrosRepo.excluirDoUsuario(id);
        await coberturaRepo.excluirDoUsuario(id);
        await processosRepo.excluirDoUsuario(id);
      },
      (id) => processosRepo.listar(id),
    ),
    processos: processosServico,
    documentosProcesso: documentosArquivos,
    fluxo,
    pareceres,
    redacaoParecer,
    biblioteca,
    analises,
    movimentacoes,
    padroes,
    citacoes,
    linhaDoTempo,
    providencias,
    revisoes,
    editorIa,
    pesquisa,
    calendarioOficial,
    agente,
    fluxosIa,
    pedidos,
    portal,
    monitor,
    nomeDoEscritorio,
    espacos: new EspacoTrabalhoService(espacosRepo, (id) => agenda.agendar(id), (id) => escritorio.papelDe(id)),
    escritorio,
    usuarios: deps.usuarios,
    rondaComunica,
    cobertura: new CoberturaService({
      repo: coberturaRepo,
      espacos: espacosRepo,
      clock,
      rondaLigada: config.comunica.rondaLigada,
      intervaloHoras: config.comunica.rondaIntervaloHoras,
    }),
    avisos,
    resumos,
    agenda,
    administracao: new AdministracaoService({ usuarios: deps.usuarios, sessoes: deps.sessoes, auditoria: deps.auditoria, diretorio, usoIa: usoIaRepo, clock }),
    limitador: deps.limitador,
  };
}

export type Container = ReturnType<typeof montar>;

// Guardado no globalThis para sobreviver ao hot reload do `next dev` (o limitador é em memória).
const g = globalThis as typeof globalThis & { __containerIntimacoes?: Container };

export function container(): Container {
  return (g.__containerIntimacoes ??= montar());
}
