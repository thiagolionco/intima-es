import { MINUTO } from "../../core/clock.ts";
import { AppError } from "../../core/errors.ts";
import type { EspacoTrabalhoRepository } from "../../workspace/espaco-trabalho.ts";
import { type ContextoRequisicao, paraPublico, type Sessao, type UsuarioPublico } from "../model.ts";
import { validarNome, validarSenhaNova } from "./cadastro.ts";
import type { DependenciasAuth } from "./dependencias.ts";

type Deps = Pick<DependenciasAuth, "usuarios" | "sessoes" | "tokens" | "auditoria" | "hash" | "limitador" | "notificacoes">;

/** Autoatendimento da conta: perfil, troca de senha, atividade, exportação e exclusão (LGPD). */
export class ContaService {
  private readonly d: Deps;
  private readonly espacos: EspacoTrabalhoRepository;

  constructor(deps: Deps, espacos: EspacoTrabalhoRepository) {
    this.d = deps;
    this.espacos = espacos;
  }

  async atualizarPerfil(usuarioId: string, dados: { nome?: string; escritorio?: string; oab?: string }, ctx: ContextoRequisicao): Promise<UsuarioPublico> {
    const alteracoes: { nome?: string; escritorio?: string; oab?: string } = {};
    if (dados.nome !== undefined) alteracoes.nome = validarNome(String(dados.nome));
    if (dados.escritorio !== undefined) alteracoes.escritorio = String(dados.escritorio).trim().slice(0, 120) || undefined;
    if (dados.oab !== undefined) alteracoes.oab = String(dados.oab).trim().toUpperCase().slice(0, 20) || undefined;
    const u = await this.d.usuarios.atualizar(usuarioId, alteracoes);
    await this.d.auditoria.registrar({ usuarioId, tipo: "perfil.atualizado", ...ctx });
    return paraPublico(u);
  }

  /** Troca a senha e encerra todas as outras sessões (a atual continua). */
  async alterarSenha(sessao: Sessao, atual: string, nova: string, ctx: ContextoRequisicao): Promise<{ sessoesEncerradas: number }> {
    this.d.limitador.consumir(`reautenticar:${sessao.usuarioId}`, 10, 15 * MINUTO);
    const usuario = await this.d.usuarios.porId(sessao.usuarioId);
    if (!usuario) throw new AppError("nao_autenticado", "Sessão inválida.");
    if (typeof atual !== "string" || !(await this.d.hash.verificar(atual, usuario.senhaHash))) {
      throw new AppError("senha_atual_incorreta", "A senha atual não confere.", { campo: "atual" });
    }
    if (atual === nova) throw new AppError("senha_fraca", "A nova senha precisa ser diferente da atual.", { campo: "nova" });
    validarSenhaNova(nova, { email: usuario.email, nome: usuario.nome });
    const atualizado = await this.d.usuarios.atualizar(usuario.id, { senhaHash: await this.d.hash.gerar(nova), senhaAlteradaEm: new Date().toISOString() });
    const n = await this.d.sessoes.excluirDoUsuario(usuario.id, sessao.id);
    await this.d.tokens.excluirDoUsuario(usuario.id, "redefinir_senha");
    await this.d.auditoria.registrar({ usuarioId: usuario.id, tipo: "senha.alterada", ...ctx, detalhe: n ? `${n} outra(s) sessão(ões) encerrada(s)` : undefined });
    await this.d.notificacoes.senhaAlterada(atualizado, ctx).catch(() => undefined);
    return { sessoesEncerradas: n };
  }

  atividade(usuarioId: string, limite = 100) {
    return this.d.auditoria.doUsuario(usuarioId, limite);
  }

  /** Portabilidade (LGPD art. 18, V): tudo o que guardamos sobre o titular, sem segredos. */
  async exportar(usuarioId: string, ctx: ContextoRequisicao) {
    const usuario = await this.d.usuarios.porId(usuarioId);
    if (!usuario) throw new AppError("nao_autenticado", "Sessão inválida.");
    const [espaco, sessoes, atividade] = await Promise.all([this.espacos.ler(usuarioId), this.d.sessoes.doUsuario(usuarioId), this.d.auditoria.doUsuario(usuarioId, 1000)]);
    await this.d.auditoria.registrar({ usuarioId, tipo: "dados.exportados", ...ctx });
    return {
      formato: "controle-intimacoes/exportacao-titular",
      versao: 2,
      exportadoEm: new Date().toISOString(),
      conta: { ...paraPublico(usuario), aceitouTermosEm: usuario.aceitouTermosEm, emailConfirmadoEm: usuario.emailConfirmadoEm },
      sessoesAtivas: sessoes.map(({ id: _id, ...s }) => s),
      atividade,
      intimacoes: espaco.intimacoes,
      termos: espaco.termos,
      suspensoes: espaco.suspensoes ?? [],
    };
  }

  /** Exclusão definitiva da conta e de todos os dados (LGPD art. 18, VI). */
  async excluir(usuarioId: string, senha: string, confirmacao: string): Promise<void> {
    this.d.limitador.consumir(`reautenticar:${usuarioId}`, 10, 15 * MINUTO);
    const usuario = await this.d.usuarios.porId(usuarioId);
    if (!usuario) throw new AppError("nao_autenticado", "Sessão inválida.");
    if (typeof senha !== "string" || !(await this.d.hash.verificar(senha, usuario.senhaHash))) throw new AppError("senha_atual_incorreta", "Senha incorreta.", { campo: "senha" });
    if (String(confirmacao ?? "").trim().toLowerCase() !== usuario.email) {
      throw new AppError("dados_invalidos", "Digite seu e-mail exatamente como cadastrado para confirmar.", { campo: "confirmacao" });
    }
    await this.espacos.excluir(usuarioId);
    await this.d.sessoes.excluirDoUsuario(usuarioId);
    await this.d.tokens.excluirDoUsuario(usuarioId);
    await this.d.auditoria.excluirDoUsuario(usuarioId);
    await this.d.usuarios.excluir(usuarioId);
  }
}
