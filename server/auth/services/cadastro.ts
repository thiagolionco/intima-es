import { avaliarSenha, emailValido, SENHA_MAXIMO } from "../../../lib/auth/politica-senha.ts";
import { DIA, HORA, MINUTO } from "../../core/clock.ts";
import { novoId, sha256, tokenAleatorio } from "../../core/crypto.ts";
import { AppError } from "../../core/errors.ts";
import { type ContextoRequisicao, normalizarEmail, type Usuario } from "../model.ts";
import type { DependenciasAuth } from "./dependencias.ts";

export interface DadosCadastro {
  nome: string;
  email: string;
  senha: string;
  escritorio?: string;
  oab?: string;
  aceitouTermos: boolean;
}

type Deps = Pick<DependenciasAuth, "usuarios" | "tokens" | "auditoria" | "hash" | "limitador" | "notificacoes" | "clock" | "links">;

export function validarNome(nome: string): string {
  const limpo = nome.trim().replace(/\s+/g, " ");
  if (limpo.length < 3 || limpo.length > 120) throw new AppError("dados_invalidos", "Informe seu nome completo.", { campo: "nome" });
  return limpo;
}

export function validarSenhaNova(senha: string, contexto: { email?: string; nome?: string }) {
  if (typeof senha !== "string" || senha.length > SENHA_MAXIMO) throw new AppError("senha_fraca", "Senha inválida.", { campo: "senha" });
  const av = avaliarSenha(senha, contexto);
  if (!av.valida) {
    const faltando = av.requisitos.filter((r) => !r.ok && r.id !== "simbolo").map((r) => r.rotulo.toLowerCase());
    throw new AppError("senha_fraca", `A senha precisa ter: ${faltando.join("; ") || "mais variedade de caracteres"}.`, { campo: "senha" });
  }
}

/** Criação de conta e confirmação de e-mail. */
export class CadastroService {
  private readonly d: Deps;

  constructor(deps: Deps) {
    this.d = deps;
  }

  /**
   * Sempre termina do mesmo jeito para quem chama, exista ou não a conta: assim o formulário
   * de cadastro não serve para descobrir quais e-mails estão cadastrados.
   */
  async cadastrar(dados: DadosCadastro, ctx: ContextoRequisicao): Promise<{ email: string }> {
    this.d.limitador.consumir(`cadastro:ip:${ctx.ip}`, 10, HORA);
    const nome = validarNome(dados.nome ?? "");
    const email = normalizarEmail(dados.email ?? "");
    if (!emailValido(email)) throw new AppError("dados_invalidos", "Informe um e-mail válido.", { campo: "email" });
    validarSenhaNova(dados.senha, { email, nome });
    if (!dados.aceitouTermos) throw new AppError("dados_invalidos", "É preciso aceitar os termos de uso e a política de privacidade.", { campo: "termos" });

    const existente = await this.d.usuarios.porEmail(email);
    if (existente) {
      // Gasta o mesmo tempo de um cadastro real, para o tempo de resposta não denunciar a conta.
      await this.d.hash.gerar(dados.senha);
      this.d.limitador.consumir(`cadastro:email:${email}`, 3, HORA);
      if (existente.emailConfirmadoEm) {
        await this.d.notificacoes.contaJaExiste(existente, this.d.links.entrar(email), this.d.links.esqueciSenha(email));
      } else {
        await this.enviarConfirmacao(existente);
      }
      return { email };
    }

    const agora = this.d.clock.agora().toISOString();
    const usuario: Usuario = {
      id: novoId(),
      nome,
      email,
      escritorio: dados.escritorio?.trim().slice(0, 120) || undefined,
      oab: dados.oab?.trim().toUpperCase().slice(0, 20) || undefined,
      senhaHash: await this.d.hash.gerar(dados.senha),
      totpAtivo: false,
      codigosRecuperacao: [],
      tentativasFalhas: 0,
      senhaAlteradaEm: agora,
      aceitouTermosEm: agora,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    try {
      await this.d.usuarios.criar(usuario);
    } catch (e) {
      // Corrida entre dois cadastros simultâneos com o mesmo e-mail: mesma resposta neutra.
      if (e instanceof AppError && e.codigo === "conflito") return { email };
      throw e;
    }
    await this.d.auditoria.registrar({ usuarioId: usuario.id, tipo: "conta.criada", ...ctx });
    await this.enviarConfirmacao(usuario);
    return { email };
  }

  async reenviarConfirmacao(emailBruto: string, ctx: ContextoRequisicao): Promise<void> {
    const email = normalizarEmail(emailBruto ?? "");
    this.d.limitador.consumir(`reenvio:ip:${ctx.ip}`, 10, HORA);
    this.d.limitador.consumir(`reenvio:email:${email}`, 3, 15 * MINUTO);
    const usuario = await this.d.usuarios.porEmail(email);
    if (usuario && !usuario.emailConfirmadoEm) await this.enviarConfirmacao(usuario);
  }

  async confirmarEmail(token: string, ctx: ContextoRequisicao): Promise<{ email: string }> {
    this.d.limitador.consumir(`confirmar:ip:${ctx.ip}`, 30, 15 * MINUTO);
    const registro = typeof token === "string" && token ? await this.d.tokens.consumir(sha256(token), "confirmar_email") : null;
    if (!registro) throw new AppError("token_invalido", "Este link de confirmação é inválido ou expirou. Peça um novo.");
    const usuario = await this.d.usuarios.porId(registro.usuarioId);
    if (!usuario) throw new AppError("token_invalido", "Conta não encontrada.");
    if (!usuario.emailConfirmadoEm) {
      await this.d.usuarios.atualizar(usuario.id, { emailConfirmadoEm: this.d.clock.agora().toISOString() });
      await this.d.auditoria.registrar({ usuarioId: usuario.id, tipo: "email.confirmado", ...ctx });
    }
    await this.d.tokens.excluirDoUsuario(usuario.id, "confirmar_email");
    return { email: usuario.email };
  }

  private async enviarConfirmacao(usuario: Usuario) {
    const token = tokenAleatorio();
    const agora = this.d.clock.agora();
    await this.d.tokens.excluirDoUsuario(usuario.id, "confirmar_email");
    await this.d.tokens.salvar({
      id: sha256(token),
      usuarioId: usuario.id,
      finalidade: "confirmar_email",
      criadoEm: agora.toISOString(),
      expiraEm: new Date(agora.getTime() + DIA).toISOString(),
    });
    await this.d.notificacoes.confirmarEmail(usuario, this.d.links.confirmarEmail(token));
  }
}
