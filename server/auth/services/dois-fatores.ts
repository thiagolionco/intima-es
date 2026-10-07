import { randomInt } from "node:crypto";
import { MINUTO } from "../../core/clock.ts";
import { sha256 } from "../../core/crypto.ts";
import { AppError } from "../../core/errors.ts";
import type { ContextoRequisicao } from "../model.ts";
import { normalizarCodigoRecuperacao } from "./autenticacao.ts";
import type { DependenciasAuth } from "./dependencias.ts";

type Deps = Pick<DependenciasAuth, "usuarios" | "auditoria" | "hash" | "limitador" | "segundoFator" | "notificacoes" | "emissor2fa">;

const QTD_CODIGOS = 10;
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O e 1/I para evitar confusão

function gerarCodigosRecuperacao(): string[] {
  return Array.from({ length: QTD_CODIGOS }, () => {
    const s = Array.from({ length: 10 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

/** Verificação em duas etapas (TOTP) e códigos de recuperação. */
export class DoisFatoresService {
  private readonly d: Deps;

  constructor(deps: Deps) {
    this.d = deps;
  }

  /** Gera um segredo novo (ainda inativo) para o usuário escanear no aplicativo. */
  async iniciar(usuarioId: string): Promise<{ segredo: string; uri: string }> {
    const usuario = await this.d.usuarios.porId(usuarioId);
    if (!usuario) throw new AppError("nao_autenticado", "Sessão inválida.");
    if (usuario.totpAtivo) throw new AppError("conflito", "A verificação em duas etapas já está ativa.");
    const segredo = this.d.segundoFator.gerarSegredo();
    await this.d.usuarios.atualizar(usuarioId, { totpSegredo: segredo });
    return { segredo, uri: this.d.segundoFator.uriDeConfiguracao(segredo, usuario.email, this.d.emissor2fa) };
  }

  /** Confirma o primeiro código do aplicativo e devolve os códigos de recuperação (mostrados uma única vez). */
  async ativar(usuarioId: string, codigo: string, ctx: ContextoRequisicao): Promise<{ codigosRecuperacao: string[] }> {
    this.d.limitador.consumir(`2fa-ativar:${usuarioId}`, 10, 15 * MINUTO);
    const usuario = await this.d.usuarios.porId(usuarioId);
    if (!usuario?.totpSegredo || usuario.totpAtivo) throw new AppError("conflito", "Inicie a configuração novamente.");
    const passo = this.d.segundoFator.verificar(usuario.totpSegredo, String(codigo ?? ""));
    if (passo === null) throw new AppError("codigo_invalido", "Código incorreto. Digite o código de 6 dígitos que aparece agora no aplicativo.");
    const codigos = gerarCodigosRecuperacao();
    const atualizado = await this.d.usuarios.atualizar(usuarioId, {
      totpAtivo: true,
      totpUltimoPasso: passo,
      codigosRecuperacao: codigos.map((c) => sha256(normalizarCodigoRecuperacao(c))),
    });
    await this.d.auditoria.registrar({ usuarioId, tipo: "2fa.ativado", ...ctx });
    await this.d.notificacoes.doisFatoresAlterado(atualizado, true).catch(() => undefined);
    return { codigosRecuperacao: codigos };
  }

  async desativar(usuarioId: string, senha: string, ctx: ContextoRequisicao): Promise<void> {
    const usuario = await this.confirmarSenha(usuarioId, senha);
    const atualizado = await this.d.usuarios.atualizar(usuarioId, { totpAtivo: false, totpSegredo: undefined, totpUltimoPasso: undefined, codigosRecuperacao: [] });
    if (usuario.totpAtivo) {
      await this.d.auditoria.registrar({ usuarioId, tipo: "2fa.desativado", ...ctx });
      await this.d.notificacoes.doisFatoresAlterado(atualizado, false).catch(() => undefined);
    }
  }

  async regenerarCodigos(usuarioId: string, senha: string, ctx: ContextoRequisicao): Promise<{ codigosRecuperacao: string[] }> {
    const usuario = await this.confirmarSenha(usuarioId, senha);
    if (!usuario.totpAtivo) throw new AppError("conflito", "Ative a verificação em duas etapas primeiro.");
    const codigos = gerarCodigosRecuperacao();
    await this.d.usuarios.atualizar(usuarioId, { codigosRecuperacao: codigos.map((c) => sha256(normalizarCodigoRecuperacao(c))) });
    await this.d.auditoria.registrar({ usuarioId, tipo: "2fa.codigos_regenerados", ...ctx });
    return { codigosRecuperacao: codigos };
  }

  private async confirmarSenha(usuarioId: string, senha: string) {
    this.d.limitador.consumir(`reautenticar:${usuarioId}`, 10, 15 * MINUTO);
    const usuario = await this.d.usuarios.porId(usuarioId);
    if (!usuario) throw new AppError("nao_autenticado", "Sessão inválida.");
    if (typeof senha !== "string" || !(await this.d.hash.verificar(senha, usuario.senhaHash))) throw new AppError("senha_atual_incorreta", "Senha incorreta.", { campo: "senha" });
    return usuario;
  }
}
