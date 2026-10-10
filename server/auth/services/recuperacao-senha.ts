import { emailValido } from "../../../lib/auth/politica-senha.ts";
import { HORA, MINUTO } from "../../core/clock.ts";
import { sha256, tokenAleatorio } from "../../core/crypto.ts";
import { AppError } from "../../core/errors.ts";
import { type ContextoRequisicao, normalizarEmail } from "../model.ts";
import { validarSenhaNova } from "./cadastro.ts";
import type { DependenciasAuth } from "./dependencias.ts";

type Deps = Pick<DependenciasAuth, "usuarios" | "tokens" | "sessoes" | "auditoria" | "hash" | "limitador" | "notificacoes" | "clock" | "links">;

const VALIDADE = 30 * MINUTO;

/** "Esqueci minha senha": pedido por e-mail e troca com token de uso único. */
export class RecuperacaoSenhaService {
  private readonly d: Deps;

  constructor(deps: Deps) {
    this.d = deps;
  }

  /** Resposta sempre igual, exista ou não a conta. */
  async solicitar(emailBruto: string, ctx: ContextoRequisicao): Promise<void> {
    const email = normalizarEmail(emailBruto ?? "");
    if (!emailValido(email)) throw new AppError("dados_invalidos", "Informe um e-mail válido.", { campo: "email" });
    this.d.limitador.consumir(`recuperar:ip:${ctx.ip}`, 10, HORA);
    this.d.limitador.consumir(`recuperar:email:${email}`, 3, 15 * MINUTO);

    const usuario = await this.d.usuarios.porEmail(email);
    if (!usuario) return;
    const token = tokenAleatorio();
    const agora = this.d.clock.agora();
    await this.d.tokens.excluirDoUsuario(usuario.id, "redefinir_senha");
    await this.d.tokens.salvar({
      id: sha256(token),
      usuarioId: usuario.id,
      finalidade: "redefinir_senha",
      criadoEm: agora.toISOString(),
      expiraEm: new Date(agora.getTime() + VALIDADE).toISOString(),
    });
    await this.d.auditoria.registrar({ usuarioId: usuario.id, tipo: "senha.redefinicao_solicitada", ...ctx });
    await this.d.notificacoes.redefinirSenha(usuario, this.d.links.redefinirSenha(token));
  }

  async redefinir(token: string, novaSenha: string, ctx: ContextoRequisicao): Promise<{ email: string }> {
    this.d.limitador.consumir(`redefinir:ip:${ctx.ip}`, 20, 15 * MINUTO);
    const id = typeof token === "string" && token ? sha256(token) : "";
    // Valida a senha antes de consumir o token, para um erro de digitação não queimar o link.
    const previa = id ? await this.peekUsuario(id) : null;
    if (!previa) throw new AppError("token_invalido", "Este link de redefinição é inválido ou expirou. Peça um novo.");
    validarSenhaNova(novaSenha, { email: previa.email, nome: previa.nome });

    const registro = await this.d.tokens.consumir(id, "redefinir_senha");
    if (!registro) throw new AppError("token_invalido", "Este link de redefinição é inválido ou expirou. Peça um novo.");
    const agora = this.d.clock.agora().toISOString();
    const usuario = await this.d.usuarios.atualizar(registro.usuarioId, {
      senhaHash: await this.d.hash.gerar(novaSenha),
      senhaAlteradaEm: agora,
      tentativasFalhas: 0,
      bloqueadoAte: undefined,
      // Quem recebeu o link no e-mail comprovou ser dono dele.
      emailConfirmadoEm: previa.emailConfirmadoEm ?? agora,
    });
    await this.d.sessoes.excluirDoUsuario(usuario.id);
    await this.d.tokens.excluirDoUsuario(usuario.id, "redefinir_senha");
    await this.d.auditoria.registrar({ usuarioId: usuario.id, tipo: "senha.redefinida", ...ctx });
    await this.d.notificacoes.senhaAlterada(usuario, ctx).catch(() => undefined);
    return { email: usuario.email };
  }

  /** Confere se o token existe sem consumi-lo (usado pela página antes de mostrar o formulário). */
  async verificarToken(token: string): Promise<{ email: string } | null> {
    if (typeof token !== "string" || !token) return null;
    const u = await this.peekUsuario(sha256(token));
    return u ? { email: u.email } : null;
  }

  private async peekUsuario(id: string) {
    const registro = await this.d.tokens.porId(id, "redefinir_senha");
    return registro ? this.d.usuarios.porId(registro.usuarioId) : null;
  }
}
