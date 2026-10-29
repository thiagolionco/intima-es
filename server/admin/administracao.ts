import type { ContextoRequisicao, EventoAuditoria, Sessao, TipoEvento, Usuario } from "../auth/model.ts";
import type { Auditoria, SessaoRepository, UsuarioRepository } from "../auth/ports.ts";
import type { Clock } from "../core/clock.ts";
import { AppError } from "../core/errors.ts";
import type { ArmazenamentoDocumentos } from "../infra/armazenamento.ts";

/**
 * Administração da plataforma: um administrador vê as contas de todos os escritórios e pode
 * desativá-las, reativá-las e conceder ou retirar o papel de administrador.
 *
 * A permissão é conferida aqui, a cada chamada, contra o cadastro atual (não contra o que a
 * interface mostra). No Postgres, o próprio banco também só libera a leitura entre escritórios
 * para administradores (migração 0009).
 */

export interface FiliacaoEscritorio {
  escritorioId: string;
  nome: string;
  papel: string;
}

export interface ContaNoDiretorio {
  usuario: Usuario;
  escritorios: FiliacaoEscritorio[];
  /** Último login com senha bem-sucedido (trilha de auditoria). */
  ultimoLoginEm?: string;
  /** Último uso registrado de uma sessão da conta (atualizado de tempos em tempos). */
  ultimoUsoSessaoEm?: string;
  /** Último evento da trilha que só a própria pessoa, já dentro da conta, gera (ver EVENTOS_DE_USO). */
  ultimoEventoDeUsoEm?: string;
}

/**
 * Eventos que só acontecem com a pessoa usando a conta. Servem de sinal de acesso quando a sessão
 * já não existe: sair da conta, por exemplo, apaga a sessão, mas fica o evento "logout".
 */
export const EVENTOS_DE_USO: TipoEvento[] = [
  "login.sucesso",
  "logout",
  "senha.alterada",
  "senha.redefinida",
  "sessao.encerrada",
  "sessoes.encerradas",
  "2fa.ativado",
  "2fa.desativado",
  "2fa.codigos_regenerados",
  "2fa.codigo_recuperacao_usado",
  "perfil.atualizado",
  "dados.exportados",
];

/** Todas as contas, com os escritórios de cada uma. Só responde para um administrador. */
export interface DiretorioDeContas {
  listar(administradorId: string): Promise<ContaNoDiretorio[]>;
}

/** O que a tela de administração recebe sobre cada conta (sem segredos). */
export interface ContaAdministrada {
  id: string;
  nome: string;
  email: string;
  oab?: string;
  escritorios: FiliacaoEscritorio[];
  administrador: boolean;
  ativa: boolean;
  desativadaEm?: string;
  emailConfirmado: boolean;
  doisFatoresAtivo: boolean;
  bloqueadaAte?: string;
  criadaEm: string;
  /** Quando a conta entrou pela última vez (vazio: nunca entrou). */
  ultimoLoginEm?: string;
  /**
   * Último sinal de uso: o mais recente entre o login, o uso de uma sessão e os eventos de uso.
   * Com "Manter conectado" a sessão dura semanas, então o login sozinho fica velho.
   */
  ultimoAcessoEm?: string;
  voceMesmo: boolean;
}

interface Deps {
  usuarios: UsuarioRepository;
  sessoes: SessaoRepository;
  auditoria: Auditoria;
  diretorio: DiretorioDeContas;
  clock: Clock;
}

export const ehAdministrador = (u: Usuario | null | undefined): u is Usuario => !!u?.administrador && !u.desativadoEm;

export class AdministracaoService {
  private readonly d: Deps;

  constructor(deps: Deps) {
    this.d = deps;
  }

  /** Relê o cadastro de quem pede: quem perdeu o papel no meio da sessão já não passa. */
  private async exigirAdministrador(administradorId: string): Promise<Usuario> {
    const admin = await this.d.usuarios.porId(administradorId);
    if (!ehAdministrador(admin)) throw new AppError("sem_permissao", "Esta área é só para a administração da Clepsa.");
    return admin;
  }

  private async alvo(administrador: Usuario, alvoId: unknown): Promise<Usuario> {
    if (typeof alvoId !== "string" || !alvoId) throw new AppError("dados_invalidos", "Conta não informada.");
    if (alvoId === administrador.id) throw new AppError("conflito", "Você não pode alterar a sua própria conta por aqui. Peça a outro administrador.");
    const alvo = await this.d.usuarios.porId(alvoId);
    if (!alvo) throw new AppError("nao_encontrado", "Conta não encontrada.");
    return alvo;
  }

  async listar(administradorId: string): Promise<ContaAdministrada[]> {
    await this.exigirAdministrador(administradorId);
    const agora = this.d.clock.agora().toISOString();
    const contas = await this.d.diretorio.listar(administradorId);
    return contas
      .map(({ usuario: u, escritorios, ultimoLoginEm, ultimoUsoSessaoEm, ultimoEventoDeUsoEm }) => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        oab: u.oab,
        escritorios,
        administrador: !!u.administrador,
        ativa: !u.desativadoEm,
        desativadaEm: u.desativadoEm,
        emailConfirmado: !!u.emailConfirmadoEm,
        doisFatoresAtivo: u.totpAtivo,
        bloqueadaAte: u.bloqueadoAte && u.bloqueadoAte > agora ? u.bloqueadoAte : undefined,
        criadaEm: u.criadoEm,
        ultimoLoginEm,
        ultimoAcessoEm: [ultimoLoginEm, ultimoUsoSessaoEm, ultimoEventoDeUsoEm].filter((x): x is string => !!x).sort().at(-1),
        voceMesmo: u.id === administradorId,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  /** Desativa a conta e encerra todas as sessões dela na hora. */
  async desativar(administradorId: string, alvoId: unknown, ctx: ContextoRequisicao): Promise<void> {
    const admin = await this.exigirAdministrador(administradorId);
    const alvo = await this.alvo(admin, alvoId);
    if (alvo.desativadoEm) return;
    await this.d.usuarios.atualizar(alvo.id, { desativadoEm: this.d.clock.agora().toISOString() });
    await this.d.sessoes.excluirDoUsuario(alvo.id);
    await this.registrar(alvo, admin, "conta.desativada", ctx);
  }

  async reativar(administradorId: string, alvoId: unknown, ctx: ContextoRequisicao): Promise<void> {
    const admin = await this.exigirAdministrador(administradorId);
    const alvo = await this.alvo(admin, alvoId);
    if (!alvo.desativadoEm) return;
    await this.d.usuarios.atualizar(alvo.id, { desativadoEm: undefined });
    await this.registrar(alvo, admin, "conta.reativada", ctx);
  }

  async definirAdministrador(administradorId: string, alvoId: unknown, administrador: unknown, ctx: ContextoRequisicao): Promise<void> {
    if (typeof administrador !== "boolean") throw new AppError("dados_invalidos", "Informe se a conta será administradora.");
    const admin = await this.exigirAdministrador(administradorId);
    const alvo = await this.alvo(admin, alvoId);
    if (!!alvo.administrador === administrador) return;
    if (administrador && alvo.desativadoEm) throw new AppError("conflito", "Reative a conta antes de torná-la administradora.");
    await this.d.usuarios.atualizar(alvo.id, { administrador });
    await this.registrar(alvo, admin, administrador ? "administrador.concedido" : "administrador.removido", ctx);
  }

  /** Fica no histórico da conta alterada, com quem fez a alteração. */
  private registrar(alvo: Usuario, admin: Usuario, tipo: "conta.desativada" | "conta.reativada" | "administrador.concedido" | "administrador.removido", ctx: ContextoRequisicao) {
    return this.d.auditoria.registrar({ usuarioId: alvo.id, tipo, ...ctx, detalhe: `Por ${admin.nome} (${admin.email})` });
  }
}

/** Versão em documentos (sem banco): cada conta tem um escritório só, do qual é dona. */
export class DiretorioDeContasDocumentos implements DiretorioDeContas {
  private readonly db: ArmazenamentoDocumentos;
  constructor(db: ArmazenamentoDocumentos) {
    this.db = db;
  }

  async listar(administradorId: string) {
    const lista = await this.db.ler<Usuario[]>("usuarios", []);
    if (!ehAdministrador(lista.find((u) => u.id === administradorId))) throw new AppError("sem_permissao", "Esta área é só para a administração da Clepsa.");
    const sessoes = await this.db.ler<Sessao[]>("sessoes", []);
    return Promise.all(
      lista.map(async (usuario) => {
        // A trilha fica do evento mais novo para o mais antigo.
        const eventos = await this.db.ler<EventoAuditoria[]>(`auditoria/${usuario.id}`, []);
        return {
          usuario,
          escritorios: [{ escritorioId: usuario.id, nome: usuario.escritorio?.trim() || usuario.nome, papel: "dono" }],
          ultimoLoginEm: eventos.find((e) => e.tipo === "login.sucesso")?.em,
          ultimoEventoDeUsoEm: eventos.find((e) => EVENTOS_DE_USO.includes(e.tipo))?.em,
          ultimoUsoSessaoEm: sessoes.filter((x) => x.usuarioId === usuario.id).map((x) => x.ultimoUsoEm).sort().at(-1),
        };
      }),
    );
  }
}
