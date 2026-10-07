import { MINUTO } from "../../core/clock.ts";
import { sha256, tokenAleatorio } from "../../core/crypto.ts";
import { AppError } from "../../core/errors.ts";
import { type ContextoRequisicao, normalizarEmail, type Sessao, type Usuario } from "../model.ts";
import type { DependenciasAuth } from "./dependencias.ts";
import type { SessaoService } from "./sessoes.ts";

type Deps = Pick<DependenciasAuth, "usuarios" | "desafios" | "auditoria" | "hash" | "limitador" | "segundoFator" | "notificacoes" | "clock" | "links">;

export const MAX_TENTATIVAS = 5;
export const TEMPO_BLOQUEIO = 15 * MINUTO;
const VALIDADE_DESAFIO = 5 * MINUTO;
const MAX_TENTATIVAS_CODIGO = 5;

/** Hash calculado uma vez para igualar o tempo de resposta quando o e-mail não existe. */
let hashFicticio: Promise<string> | null = null;

export type ResultadoLogin = { tipo: "sessao"; token: string; sessao: Sessao; usuario: Usuario } | { tipo: "segundo_fator"; desafio: string; expiraEm: string };

export interface DadosLogin {
  email: string;
  senha: string;
  lembrar?: boolean;
}

/** Login com senha e, quando ativo, segundo fator (TOTP ou código de recuperação). */
export class AutenticacaoService {
  private readonly d: Deps;
  private readonly sessoes: SessaoService;

  constructor(deps: Deps, sessoes: SessaoService) {
    this.d = deps;
    this.sessoes = sessoes;
  }

  async entrar(dados: DadosLogin, ctx: ContextoRequisicao): Promise<ResultadoLogin> {
    const email = normalizarEmail(dados.email ?? "");
    const senha = typeof dados.senha === "string" ? dados.senha : "";
    this.d.limitador.consumir(`login:ip:${ctx.ip}`, 30, 15 * MINUTO);
    this.d.limitador.consumir(`login:email:${email}`, 15, 15 * MINUTO);
    if (!email || !senha) throw new AppError("dados_invalidos", "Informe e-mail e senha.");

    const usuario = await this.d.usuarios.porEmail(email);
    if (!usuario) {
      hashFicticio ??= this.d.hash.gerar(tokenAleatorio());
      await this.d.hash.verificar(senha, await hashFicticio);
      throw credenciaisInvalidas();
    }

    const agora = this.d.clock.agora();
    if (usuario.bloqueadoAte && usuario.bloqueadoAte > agora.toISOString()) {
      throw new AppError("conta_bloqueada", "Por segurança, o acesso a esta conta está bloqueado temporariamente após várias senhas incorretas.", {
        bloqueadoAte: usuario.bloqueadoAte,
      });
    }

    if (!(await this.d.hash.verificar(senha, usuario.senhaHash))) {
      await this.registrarFalha(usuario, ctx);
      throw credenciaisInvalidas();
    }

    if (usuario.tentativasFalhas || usuario.bloqueadoAte) await this.d.usuarios.atualizar(usuario.id, { tentativasFalhas: 0, bloqueadoAte: undefined });

    // Só revelamos que o e-mail não foi confirmado depois de a senha estar correta.
    if (!usuario.emailConfirmadoEm) throw new AppError("email_nao_confirmado", "Confirme seu e-mail antes de entrar. Enviamos um link quando você criou a conta.", { email });

    if (usuario.totpAtivo && usuario.totpSegredo) {
      const desafio = tokenAleatorio();
      const expiraEm = new Date(agora.getTime() + VALIDADE_DESAFIO).toISOString();
      await this.d.desafios.salvar({ id: sha256(desafio), usuarioId: usuario.id, lembrar: !!dados.lembrar, tentativas: 0, expiraEm });
      return { tipo: "segundo_fator", desafio, expiraEm };
    }

    const { token, sessao } = await this.sessoes.criar(usuario, !!dados.lembrar, ctx);
    return { tipo: "sessao", token, sessao, usuario };
  }

  async confirmarSegundoFator(
    dados: { desafio: string; codigo: string; recuperacao?: boolean },
    ctx: ContextoRequisicao,
  ): Promise<{ token: string; sessao: Sessao; usuario: Usuario }> {
    this.d.limitador.consumir(`2fa:ip:${ctx.ip}`, 30, 15 * MINUTO);
    const desafio = typeof dados.desafio === "string" ? await this.d.desafios.porId(sha256(dados.desafio)) : null;
    if (!desafio) throw new AppError("desafio_expirado", "A verificação expirou. Entre novamente com sua senha.");
    const usuario = await this.d.usuarios.porId(desafio.usuarioId);
    if (!usuario || !usuario.totpAtivo || !usuario.totpSegredo) throw new AppError("desafio_expirado", "A verificação expirou. Entre novamente com sua senha.");

    const codigo = String(dados.codigo ?? "");
    let valido = false;
    if (dados.recuperacao) {
      const h = sha256(normalizarCodigoRecuperacao(codigo));
      if (usuario.codigosRecuperacao.includes(h)) {
        valido = true;
        const restantes = usuario.codigosRecuperacao.filter((c) => c !== h);
        await this.d.usuarios.atualizar(usuario.id, { codigosRecuperacao: restantes });
        usuario.codigosRecuperacao = restantes;
        await this.d.auditoria.registrar({ usuarioId: usuario.id, tipo: "2fa.codigo_recuperacao_usado", ...ctx, detalhe: `${restantes.length} restante(s)` });
      }
    } else {
      const passo = this.d.segundoFator.verificar(usuario.totpSegredo, codigo);
      if (passo !== null && passo > (usuario.totpUltimoPasso ?? -1)) {
        valido = true;
        await this.d.usuarios.atualizar(usuario.id, { totpUltimoPasso: passo });
      }
    }

    if (!valido) {
      desafio.tentativas++;
      if (desafio.tentativas >= MAX_TENTATIVAS_CODIGO) {
        await this.d.desafios.excluir(desafio.id);
        await this.d.auditoria.registrar({ usuarioId: usuario.id, tipo: "login.falha", ...ctx, detalhe: "Código de verificação incorreto (limite atingido)" });
        throw new AppError("desafio_expirado", "Muitos códigos incorretos. Entre novamente com sua senha.");
      }
      await this.d.desafios.salvar(desafio);
      throw new AppError("codigo_invalido", dados.recuperacao ? "Código de recuperação inválido ou já utilizado." : "Código incorreto. Confira o horário do celular e tente o código atual.", {
        restantes: MAX_TENTATIVAS_CODIGO - desafio.tentativas,
      });
    }

    await this.d.desafios.excluir(desafio.id);
    const { token, sessao } = await this.sessoes.criar(usuario, desafio.lembrar, ctx);
    return { token, sessao, usuario };
  }

  private async registrarFalha(usuario: Usuario, ctx: ContextoRequisicao) {
    const tentativas = usuario.tentativasFalhas + 1;
    if (tentativas >= MAX_TENTATIVAS) {
      const ate = new Date(this.d.clock.agora().getTime() + TEMPO_BLOQUEIO);
      await this.d.usuarios.atualizar(usuario.id, { tentativasFalhas: 0, bloqueadoAte: ate.toISOString() });
      await this.d.auditoria.registrar({ usuarioId: usuario.id, tipo: "login.bloqueado", ...ctx, detalhe: `${MAX_TENTATIVAS} senhas incorretas` });
      await this.d.notificacoes.contaBloqueada(usuario, ate, this.d.links.esqueciSenha(usuario.email)).catch(() => undefined);
    } else {
      await this.d.usuarios.atualizar(usuario.id, { tentativasFalhas: tentativas });
      await this.d.auditoria.registrar({ usuarioId: usuario.id, tipo: "login.falha", ...ctx, detalhe: "Senha incorreta" });
    }
  }
}

function credenciaisInvalidas() {
  return new AppError("credenciais_invalidas", "E-mail ou senha incorretos.");
}

export function normalizarCodigoRecuperacao(codigo: string): string {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
