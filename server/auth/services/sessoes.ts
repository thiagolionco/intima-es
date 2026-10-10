import { MINUTO } from "../../core/clock.ts";
import { sha256, tokenAleatorio } from "../../core/crypto.ts";
import { AppError } from "../../core/errors.ts";
import type { ContextoRequisicao, Sessao, Usuario } from "../model.ts";
import type { DependenciasAuth } from "./dependencias.ts";

type Deps = Pick<DependenciasAuth, "usuarios" | "sessoes" | "auditoria" | "notificacoes" | "clock" | "politicaSessao">;

/** Só regravamos o "último uso" de tempos em tempos, para não escrever a cada requisição. */
const INTERVALO_TOQUE = 5 * MINUTO;

export interface SessaoResumo {
  id: string;
  atual: boolean;
  criadaEm: string;
  ultimoUsoEm: string;
  expiraEm: string;
  lembrar: boolean;
  ip: string;
  userAgent: string;
}

/** Ciclo de vida das sessões: criação, validação deslizante, listagem e encerramento. */
export class SessaoService {
  private readonly d: Deps;

  constructor(deps: Deps) {
    this.d = deps;
  }

  /** Cria a sessão e devolve o token em claro (vai só para o cookie; guardamos o hash). */
  async criar(usuario: Usuario, lembrar: boolean, ctx: ContextoRequisicao): Promise<{ token: string; sessao: Sessao }> {
    const anteriores = await this.d.sessoes.doUsuario(usuario.id);
    const eventos = await this.d.auditoria.doUsuario(usuario.id, 200);
    const conhecido =
      anteriores.some((s) => s.userAgent === ctx.userAgent) || eventos.some((e) => e.tipo === "login.sucesso" && e.userAgent === ctx.userAgent);

    const token = tokenAleatorio();
    const agora = this.d.clock.agora();
    const sessao: Sessao = {
      id: sha256(token),
      usuarioId: usuario.id,
      criadaEm: agora.toISOString(),
      ultimoUsoEm: agora.toISOString(),
      expiraEm: new Date(agora.getTime() + this.inatividade(lembrar)).toISOString(),
      lembrar,
      ip: ctx.ip,
      userAgent: ctx.userAgent.slice(0, 300),
    };
    await this.d.sessoes.salvar(sessao);
    await this.d.auditoria.registrar({ usuarioId: usuario.id, tipo: "login.sucesso", ...ctx, detalhe: lembrar ? "Manter conectado" : undefined });
    // O primeiro login (logo após confirmar o e-mail) não gera alerta.
    if (!conhecido && eventos.some((e) => e.tipo === "login.sucesso")) {
      await this.d.notificacoes.novoAcesso(usuario, ctx).catch(() => undefined);
    }
    return { token, sessao };
  }

  /** Valida o token do cookie, aplicando expiração por inatividade e absoluta. */
  async validar(token: string | undefined): Promise<{ usuario: Usuario; sessao: Sessao } | null> {
    if (!token || token.length > 100) return null;
    const sessao = await this.d.sessoes.porId(sha256(token));
    if (!sessao) return null;
    const agora = this.d.clock.agora();
    const limiteAbsoluto = new Date(sessao.criadaEm).getTime() + this.absoluta(sessao.lembrar);
    if (sessao.expiraEm <= agora.toISOString() || agora.getTime() >= limiteAbsoluto) {
      await this.d.sessoes.excluir(sessao.id);
      return null;
    }
    const usuario = await this.d.usuarios.porId(sessao.usuarioId);
    if (!usuario || !usuario.emailConfirmadoEm) {
      await this.d.sessoes.excluir(sessao.id);
      return null;
    }
    if (agora.getTime() - new Date(sessao.ultimoUsoEm).getTime() > INTERVALO_TOQUE) {
      sessao.ultimoUsoEm = agora.toISOString();
      sessao.expiraEm = new Date(Math.min(agora.getTime() + this.inatividade(sessao.lembrar), limiteAbsoluto)).toISOString();
      await this.d.sessoes.salvar(sessao);
    }
    return { usuario, sessao };
  }

  async listar(usuarioId: string, atualId: string): Promise<SessaoResumo[]> {
    const lista = await this.d.sessoes.doUsuario(usuarioId);
    return lista
      .sort((a, b) => (a.id === atualId ? -1 : b.id === atualId ? 1 : b.ultimoUsoEm.localeCompare(a.ultimoUsoEm)))
      .map((s) => ({
        // O id real é o hash do token; expomos só um prefixo para identificar a sessão.
        id: s.id.slice(0, 16),
        atual: s.id === atualId,
        criadaEm: s.criadaEm,
        ultimoUsoEm: s.ultimoUsoEm,
        expiraEm: s.expiraEm,
        lembrar: s.lembrar,
        ip: s.ip,
        userAgent: s.userAgent,
      }));
  }

  async encerrar(usuarioId: string, idPublico: string, ctx: ContextoRequisicao): Promise<void> {
    const alvo = (await this.d.sessoes.doUsuario(usuarioId)).find((s) => s.id.slice(0, 16) === idPublico);
    if (!alvo) throw new AppError("nao_encontrado", "Sessão não encontrada ou já encerrada.");
    await this.d.sessoes.excluir(alvo.id);
    await this.d.auditoria.registrar({ usuarioId, tipo: "sessao.encerrada", ...ctx, detalhe: alvo.userAgent });
  }

  async encerrarOutras(usuarioId: string, atualId: string, ctx: ContextoRequisicao): Promise<number> {
    const n = await this.d.sessoes.excluirDoUsuario(usuarioId, atualId);
    await this.d.auditoria.registrar({ usuarioId, tipo: "sessoes.encerradas", ...ctx, detalhe: `${n} sessão(ões)` });
    return n;
  }

  async sair(sessao: Sessao, ctx: ContextoRequisicao): Promise<void> {
    await this.d.sessoes.excluir(sessao.id);
    await this.d.auditoria.registrar({ usuarioId: sessao.usuarioId, tipo: "logout", ...ctx });
  }

  private inatividade(lembrar: boolean) {
    return lembrar ? this.d.politicaSessao.longaInatividade : this.d.politicaSessao.curtaInatividade;
  }

  private absoluta(lembrar: boolean) {
    return lembrar ? this.d.politicaSessao.longaAbsoluta : this.d.politicaSessao.curtaAbsoluta;
  }
}
