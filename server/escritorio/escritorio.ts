import { emailValido } from "../../lib/auth/politica-senha.ts";
import { type Acao, type ConvitePendente, ehPapel, type MembroEscritorio, type PapelNoEscritorio, pode, ROTULO_PAPEL, type ResumoEscritorio } from "../../lib/escritorio.ts";
import type { PessoaEquipe } from "../../lib/types.ts";
import { type ContextoRequisicao, normalizarEmail, type Usuario } from "../auth/model.ts";
import type { Auditoria, HashDeSenha, LimitadorDeTaxa, UsuarioRepository } from "../auth/ports.ts";
import { validarNome, validarSenhaNova } from "../auth/services/cadastro.ts";
import type { Links } from "../auth/services/dependencias.ts";
import { type Clock, DIA } from "../core/clock.ts";
import { novoId, sha256, tokenAleatorio } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import { montarEmail } from "../infra/email/notificacoes.ts";
import type { EnviadorDeEmail } from "../infra/email/ports.ts";
import type { EspacoTrabalhoRepository } from "../workspace/espaco-trabalho.ts";

/**
 * Equipe do escritório: quem tem acesso, com que papel, e os convites para entrar.
 *
 * Os dados (intimações, processos…) já são do escritório, não da pessoa: quem entra passa a ver
 * e trabalhar no mesmo acervo. A permissão é conferida aqui, a cada chamada, contra o papel
 * gravado no banco, nunca contra o que a interface mostra.
 */

/** Por quanto tempo o link do convite vale. */
export const VALIDADE_CONVITE = 7 * DIA;

export interface DadosDoEscritorio {
  escritorioId: string;
  nome: string;
  papel: PapelNoEscritorio;
}

export interface FiliacaoMembro {
  usuarioId: string;
  papel: PapelNoEscritorio;
  desde: string;
}

export interface NovoConvite {
  id: string;
  tokenHash: string;
  email: string;
  papel: PapelNoEscritorio;
  pessoaId?: string;
  convidadoPor: string;
  criadoEm: string;
  expiraEm: string;
}

/** Convite achado pelo token, com o que a página de aceite precisa mostrar. */
export interface ConviteAchado extends ConvitePendente {
  escritorioId: string;
  nomeEscritorio: string;
}

export interface EscritorioRepository {
  /** Escritório da conta e o papel dela nele; null se a conta não estiver em nenhum. */
  doUsuario(usuarioId: string): Promise<DadosDoEscritorio | null>;
  /** Filiações do escritório da conta. */
  membros(usuarioId: string): Promise<FiliacaoMembro[]>;
  convites(usuarioId: string): Promise<ConvitePendente[]>;
  /** Grava o convite no escritório de quem convida, substituindo um anterior para o mesmo e-mail. */
  criarConvite(usuarioId: string, convite: NovoConvite): Promise<void>;
  revogarConvite(usuarioId: string, id: string): Promise<boolean>;
  /** Busca pelo hash do token, sem contexto de escritório (quem abre o link ainda não entrou). */
  conviteValido(tokenHash: string, agora: Date): Promise<ConviteAchado | null>;
  /**
   * Põe uma conta que já existe no escritório do convite e apaga o convite. Se ela estava sozinha
   * num escritório próprio e vazio, esse escritório some; se ele tiver dados, recusa.
   */
  aceitar(conviteId: string, usuarioId: string): Promise<void>;
  /** Cria a conta já dentro do escritório do convite (sem escritório próprio) e apaga o convite. */
  criarContaPorConvite(usuario: Usuario, conviteId: string): Promise<void>;
  /** Muda o papel; recusa tirar o último dono. */
  alterarPapel(usuarioId: string, alvoId: string, papel: PapelNoEscritorio): Promise<void>;
  /** Tira a conta do escritório e dá a ela um escritório próprio, vazio. Recusa tirar o último dono. */
  remover(usuarioId: string, alvoId: string, novoEscritorio: { id: string; nome: string; criadoEm: string }): Promise<void>;
}

const semBanco = () => new AppError("indisponivel", "Convidar pessoas para o escritório exige o banco de dados (DATABASE_URL).");

/**
 * Versão sem banco (arquivos JSON): cada conta é um escritório de uma pessoa só, da qual ela é a dona.
 * Serve para desenvolver sem Postgres; convites ficam indisponíveis.
 */
export class EscritorioRepositoryDocumentos implements EscritorioRepository {
  private readonly usuarios: Pick<UsuarioRepository, "porId">;
  constructor(usuarios: Pick<UsuarioRepository, "porId">) {
    this.usuarios = usuarios;
  }

  async doUsuario(usuarioId: string) {
    const u = await this.usuarios.porId(usuarioId);
    return u ? { escritorioId: u.id, nome: u.escritorio?.trim() || u.nome, papel: "dono" as const } : null;
  }

  async membros(usuarioId: string) {
    const u = await this.usuarios.porId(usuarioId);
    return u ? [{ usuarioId: u.id, papel: "dono" as const, desde: u.criadoEm }] : [];
  }

  async convites() {
    return [];
  }

  async criarConvite(): Promise<void> {
    throw semBanco();
  }

  async revogarConvite() {
    return false;
  }

  async conviteValido() {
    return null;
  }

  async aceitar(): Promise<void> {
    throw semBanco();
  }

  async criarContaPorConvite(): Promise<void> {
    throw semBanco();
  }

  async alterarPapel(): Promise<void> {
    throw semBanco();
  }

  async remover(): Promise<void> {
    throw semBanco();
  }
}

export interface DepsEscritorio {
  repo: EscritorioRepository;
  usuarios: UsuarioRepository;
  espacos: EspacoTrabalhoRepository;
  auditoria: Auditoria;
  hash: HashDeSenha;
  limitador: LimitadorDeTaxa;
  enviador: EnviadorDeEmail;
  clock: Clock;
  links: Pick<Links, "convite" | "entrar">;
  /** Convites só existem com banco de dados. */
  convitesDisponiveis: boolean;
}

export interface DadosConviteNovo {
  email?: unknown;
  papel?: unknown;
  pessoaId?: unknown;
}

export interface DadosContaNova {
  nome?: unknown;
  senha?: unknown;
  oab?: unknown;
  aceitouTermos?: unknown;
}

/** O que a página do link mostra antes de aceitar. */
export interface ConsultaConvite {
  escritorio: string;
  email: string;
  papel: PapelNoEscritorio;
  convidadoPor?: string;
  expiraEm: string;
  /** Já há conta com este e-mail: o aceite é feito entrando nela. */
  contaExiste: boolean;
}

export class EscritorioService {
  private readonly d: DepsEscritorio;

  constructor(deps: DepsEscritorio) {
    this.d = deps;
  }

  /** Papel da conta no escritório dela (null se não estiver em nenhum). */
  async papelDe(usuarioId: string): Promise<PapelNoEscritorio | null> {
    return (await this.d.repo.doUsuario(usuarioId))?.papel ?? null;
  }

  /** Identificador do escritório da conta, para as rotinas automáticas passarem uma vez só por escritório. */
  async escritorioDe(usuarioId: string): Promise<string | null> {
    return (await this.d.repo.doUsuario(usuarioId))?.escritorioId ?? null;
  }

  /** Lança `sem_permissao` se o papel da conta não permite a ação. */
  async exigir(usuarioId: string, acao: Acao): Promise<DadosDoEscritorio> {
    const e = await this.d.repo.doUsuario(usuarioId);
    if (!e) throw new AppError("nao_encontrado", "Sua conta não está ligada a nenhum escritório.");
    if (!pode(e.papel, acao)) throw new AppError("sem_permissao", MENSAGEM_SEM_PERMISSAO[acao](e.papel));
    return e;
  }

  async resumo(usuarioId: string): Promise<ResumoEscritorio> {
    const e = await this.d.repo.doUsuario(usuarioId);
    if (!e) throw new AppError("nao_encontrado", "Sua conta não está ligada a nenhum escritório.");
    const gerencia = pode(e.papel, "gerenciar_equipe");
    const [filiacoes, convites] = await Promise.all([this.d.repo.membros(usuarioId), gerencia ? this.d.repo.convites(usuarioId) : Promise.resolve([])]);
    const membros: MembroEscritorio[] = [];
    for (const f of filiacoes) {
      const u = await this.d.usuarios.porId(f.usuarioId);
      if (u) membros.push({ usuarioId: u.id, nome: u.nome, email: u.email, papel: f.papel, desde: f.desde });
    }
    membros.sort((a, b) => ordemPapel(a.papel) - ordemPapel(b.papel) || a.nome.localeCompare(b.nome, "pt-BR"));
    return { nome: e.nome, papel: e.papel, eu: usuarioId, membros, convites, convitesDisponiveis: this.d.convitesDisponiveis };
  }

  async convidar(usuarioId: string, dados: DadosConviteNovo, ctx: ContextoRequisicao): Promise<ConvitePendente> {
    const e = await this.exigir(usuarioId, "gerenciar_equipe");
    if (!this.d.convitesDisponiveis) throw semBanco();
    const email = normalizarEmail(typeof dados.email === "string" ? dados.email : "");
    if (!emailValido(email)) throw new AppError("dados_invalidos", "Informe um e-mail válido.", { campo: "email" });
    if (!ehPapel(dados.papel)) throw new AppError("dados_invalidos", "Escolha o papel da pessoa.", { campo: "papel" });
    const pessoaId = typeof dados.pessoaId === "string" && dados.pessoaId ? dados.pessoaId.slice(0, 64) : undefined;
    this.d.limitador.consumir(`convites:${e.escritorioId}`, 30, DIA);

    for (const f of await this.d.repo.membros(usuarioId)) {
      const u = await this.d.usuarios.porId(f.usuarioId);
      if (u?.email === email) throw new AppError("conflito", `${u.nome} já tem acesso ao escritório.`, { campo: "email" });
    }

    const ator = await this.d.usuarios.porId(usuarioId);
    const token = tokenAleatorio();
    const agora = this.d.clock.agora();
    const convite: NovoConvite = {
      id: novoId(),
      tokenHash: sha256(token),
      email,
      papel: dados.papel,
      ...(pessoaId ? { pessoaId } : {}),
      convidadoPor: usuarioId,
      criadoEm: agora.toISOString(),
      expiraEm: new Date(agora.getTime() + VALIDADE_CONVITE).toISOString(),
    };
    await this.d.repo.criarConvite(usuarioId, convite);
    await this.d.enviador.enviar(
      montarEmail(email, {
        assunto: `Convite para o escritório ${e.nome} · Clepsa`,
        titulo: `Você foi convidado para o escritório ${e.nome}`,
        paragrafos: [
          `${ator?.nome ?? "Alguém do escritório"} convidou você para trabalhar no Clepsa como ${ROTULO_PAPEL[convite.papel].toLowerCase()}.`,
          "No Clepsa vocês acompanham juntos as intimações, os prazos e os processos do escritório.",
          "O convite vale por 7 dias.",
        ],
        botao: { rotulo: "Aceitar o convite", url: this.d.links.convite(token) },
        rodape: "Se você não esperava este convite, ignore este e-mail: sem o aceite, nada acontece.",
      }),
    );
    await this.d.auditoria.registrar({ usuarioId, tipo: "escritorio.convite_enviado", ...ctx, detalhe: `${email} como ${ROTULO_PAPEL[convite.papel]}` });
    const { tokenHash: _t, convidadoPor: _c, ...pendente } = convite;
    return { ...pendente, convidadoPor: ator?.nome };
  }

  async revogarConvite(usuarioId: string, id: string): Promise<void> {
    await this.exigir(usuarioId, "gerenciar_equipe");
    if (!(await this.d.repo.revogarConvite(usuarioId, id))) throw new AppError("nao_encontrado", "Convite não encontrado.");
  }

  private async abrir(token: unknown): Promise<ConviteAchado> {
    const c = typeof token === "string" && token ? await this.d.repo.conviteValido(sha256(token), this.d.clock.agora()) : null;
    if (!c) throw new AppError("token_invalido", "Este convite não vale mais: já foi usado, foi cancelado ou expirou. Peça um novo a quem convidou.");
    return c;
  }

  async consultarConvite(token: unknown, ctx: ContextoRequisicao): Promise<ConsultaConvite> {
    this.d.limitador.consumir(`convite:ip:${ctx.ip}`, 30, 15 * 60_000);
    const c = await this.abrir(token);
    return {
      escritorio: c.nomeEscritorio,
      email: c.email,
      papel: c.papel,
      convidadoPor: c.convidadoPor,
      expiraEm: c.expiraEm,
      contaExiste: !!(await this.d.usuarios.porEmail(c.email)),
    };
  }

  /** Quem ainda não tem conta cria a sua pelo link; o link do e-mail já confirma o endereço. */
  async aceitarComContaNova(token: unknown, dados: DadosContaNova, ctx: ContextoRequisicao): Promise<{ email: string }> {
    this.d.limitador.consumir(`convite:ip:${ctx.ip}`, 30, 15 * 60_000);
    const c = await this.abrir(token);
    if (await this.d.usuarios.porEmail(c.email)) throw new AppError("conflito", "Já existe uma conta com este e-mail. Entre nela para aceitar o convite.");
    const nome = validarNome(typeof dados.nome === "string" ? dados.nome : "");
    const senha = typeof dados.senha === "string" ? dados.senha : "";
    validarSenhaNova(senha, { email: c.email, nome });
    if (dados.aceitouTermos !== true) throw new AppError("dados_invalidos", "É preciso aceitar os termos de uso e a política de privacidade.", { campo: "termos" });

    const agora = this.d.clock.agora().toISOString();
    const usuario: Usuario = {
      id: novoId(),
      nome,
      email: c.email,
      escritorio: c.nomeEscritorio,
      oab: typeof dados.oab === "string" ? dados.oab.trim().toUpperCase().slice(0, 20) || undefined : undefined,
      senhaHash: await this.d.hash.gerar(senha),
      emailConfirmadoEm: agora,
      totpAtivo: false,
      codigosRecuperacao: [],
      tentativasFalhas: 0,
      senhaAlteradaEm: agora,
      aceitouTermosEm: agora,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    await this.d.repo.criarContaPorConvite(usuario, c.id);
    await this.d.auditoria.registrar({ usuarioId: usuario.id, tipo: "conta.criada", ...ctx, detalhe: "por convite" });
    await this.d.auditoria.registrar({ usuarioId: usuario.id, tipo: "escritorio.convite_aceito", ...ctx, detalhe: c.nomeEscritorio });
    await this.ligarPessoa(usuario, c.pessoaId);
    return { email: usuario.email };
  }

  /** Quem já tem conta aceita estando logado nela, com o mesmo e-mail do convite. */
  async aceitarComConta(usuario: Usuario, token: unknown, ctx: ContextoRequisicao): Promise<{ escritorio: string }> {
    this.d.limitador.consumir(`convite:ip:${ctx.ip}`, 30, 15 * 60_000);
    const c = await this.abrir(token);
    if (c.email !== usuario.email) {
      throw new AppError("sem_permissao", `Este convite é para ${c.email}. Saia desta conta e entre com esse e-mail para aceitar.`);
    }
    await this.d.repo.aceitar(c.id, usuario.id);
    await this.d.auditoria.registrar({ usuarioId: usuario.id, tipo: "escritorio.convite_aceito", ...ctx, detalhe: c.nomeEscritorio });
    await this.ligarPessoa(usuario, c.pessoaId);
    return { escritorio: c.nomeEscritorio };
  }

  async alterarPapel(usuarioId: string, alvoId: string, papel: unknown, ctx: ContextoRequisicao): Promise<void> {
    await this.exigir(usuarioId, "gerenciar_equipe");
    if (!ehPapel(papel)) throw new AppError("dados_invalidos", "Papel inválido.");
    await this.d.repo.alterarPapel(usuarioId, alvoId, papel);
    const alvo = await this.d.usuarios.porId(alvoId);
    await this.d.auditoria.registrar({ usuarioId, tipo: "escritorio.papel_alterado", ...ctx, detalhe: `${alvo?.email ?? alvoId} agora é ${ROTULO_PAPEL[papel]}` });
  }

  /**
   * Tira alguém do escritório (o dono tira qualquer um; qualquer um pode sair). A pessoa fica na
   * lista da equipe como inativa, para as intimações antigas continuarem dizendo quem cuidou.
   * Processos particulares dela ficam guardados, invisíveis para o escritório.
   */
  async remover(usuarioId: string, alvoId: string, ctx: ContextoRequisicao): Promise<void> {
    if (alvoId !== usuarioId) await this.exigir(usuarioId, "gerenciar_equipe");
    const alvo = await this.d.usuarios.porId(alvoId);
    if (!alvo) throw new AppError("nao_encontrado", "Conta não encontrada no escritório.");
    if (!(await this.d.repo.membros(usuarioId)).some((m) => m.usuarioId === alvoId)) throw new AppError("nao_encontrado", "Esta conta não está no escritório.");
    await this.alterarEquipe(usuarioId, (equipe) => equipe.map((p) => (p.usuarioId === alvoId ? { ...p, usuarioId: undefined, inativa: true } : p)));
    await this.d.repo.remover(usuarioId, alvoId, { id: novoId(), nome: alvo.nome, criadoEm: this.d.clock.agora().toISOString() });
    await this.d.auditoria.registrar({ usuarioId, tipo: "escritorio.membro_removido", ...ctx, detalhe: alvoId === usuarioId ? "saiu do escritório" : alvo.email });
  }

  /**
   * Liga a conta a uma pessoa da lista da equipe: a indicada no convite, a que tiver o mesmo
   * e-mail ou, sem nenhuma, uma nova. A partir daí, "Responsável" aponta para alguém com acesso.
   */
  private async ligarPessoa(usuario: Usuario, pessoaId?: string) {
    await this.alterarEquipe(usuario.id, (equipe) => {
      const livre = (p: PessoaEquipe) => !p.usuarioId || p.usuarioId === usuario.id;
      const alvo =
        equipe.find((p) => p.usuarioId === usuario.id) ??
        (pessoaId ? equipe.find((p) => p.id === pessoaId && livre(p)) : undefined) ??
        equipe.find((p) => livre(p) && p.email && normalizarEmail(p.email) === usuario.email);
      if (alvo) return equipe.map((p) => (p.id === alvo.id ? { ...p, usuarioId: usuario.id, email: usuario.email, inativa: undefined } : p));
      return [...equipe, { id: novoId(), nome: usuario.nome, email: usuario.email, usuarioId: usuario.id }].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    });
  }

  /** Altera a lista da equipe no espaço do escritório, relendo se outra gravação passou na frente. */
  private async alterarEquipe(usuarioId: string, fn: (equipe: PessoaEquipe[]) => PessoaEquipe[]) {
    for (let tentativa = 0; ; tentativa++) {
      const espaco = await this.d.espacos.ler(usuarioId);
      const atual = espaco.preferencias?.equipe ?? [];
      const nova = fn(atual).map((p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as unknown as PessoaEquipe);
      if (JSON.stringify(nova) === JSON.stringify(atual)) return;
      try {
        await this.d.espacos.salvar(
          usuarioId,
          { intimacoes: espaco.intimacoes, termos: espaco.termos, suspensoes: espaco.suspensoes, preferencias: { ...espaco.preferencias, equipe: nova } },
          espaco.revisao,
        );
        return;
      } catch (e) {
        if (e instanceof AppError && e.codigo === "conflito" && tentativa < 4) continue;
        throw e;
      }
    }
  }
}

const ordemPapel = (p: PapelNoEscritorio) => ({ dono: 0, advogado: 1, estagiario: 2 })[p];

const MENSAGEM_SEM_PERMISSAO: Record<Acao, (papel: PapelNoEscritorio) => string> = {
  gerenciar_equipe: () => "Só o dono do escritório pode mexer na equipe e nos acessos.",
  excluir: (papel) => `Como ${ROTULO_PAPEL[papel].toLowerCase()}, você não pode excluir. Peça a um advogado ou ao dono do escritório.`,
  tornar_particular: () => "Só o dono do escritório pode tornar particular um processo que já é do escritório.",
  compartilhar_externo: (papel) => `Como ${ROTULO_PAPEL[papel].toLowerCase()}, você não pode abrir links para fora do escritório. Peça a um advogado ou ao dono.`,
};
