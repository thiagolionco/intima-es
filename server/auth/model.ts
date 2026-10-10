/** Entidades do domínio de identidade. Nada aqui conhece HTTP, arquivos ou e-mail. */

export interface Usuario {
  id: string;
  nome: string;
  /** Sempre em minúsculas e sem espaços nas pontas. */
  email: string;
  escritorio?: string;
  oab?: string;
  senhaHash: string;
  emailConfirmadoEm?: string;
  /** Segredo TOTP em base32 (só existe com 2FA ativo ou em configuração). */
  totpSegredo?: string;
  totpAtivo: boolean;
  /** Último passo TOTP aceito (impede reutilizar o mesmo código). */
  totpUltimoPasso?: number;
  /** Hashes dos códigos de recuperação ainda não usados. */
  codigosRecuperacao: string[];
  tentativasFalhas: number;
  bloqueadoAte?: string;
  senhaAlteradaEm: string;
  aceitouTermosEm: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Sessao {
  /** sha256 do token entregue no cookie. */
  id: string;
  usuarioId: string;
  criadaEm: string;
  ultimoUsoEm: string;
  expiraEm: string;
  lembrar: boolean;
  ip: string;
  userAgent: string;
}

export type FinalidadeToken = "confirmar_email" | "redefinir_senha";

export interface TokenVerificacao {
  /** sha256 do token enviado por e-mail. */
  id: string;
  usuarioId: string;
  finalidade: FinalidadeToken;
  expiraEm: string;
  criadoEm: string;
}

/** Login que passou pela senha e aguarda o código de dois fatores. */
export interface DesafioDoisFatores {
  id: string;
  usuarioId: string;
  lembrar: boolean;
  tentativas: number;
  expiraEm: string;
}

export type TipoEvento =
  | "conta.criada"
  | "email.confirmado"
  | "login.sucesso"
  | "login.falha"
  | "login.bloqueado"
  | "logout"
  | "senha.alterada"
  | "senha.redefinicao_solicitada"
  | "senha.redefinida"
  | "sessao.encerrada"
  | "sessoes.encerradas"
  | "2fa.ativado"
  | "2fa.desativado"
  | "2fa.codigos_regenerados"
  | "2fa.codigo_recuperacao_usado"
  | "perfil.atualizado"
  | "dados.exportados";

export interface EventoAuditoria {
  id: string;
  usuarioId: string;
  tipo: TipoEvento;
  em: string;
  ip: string;
  userAgent: string;
  detalhe?: string;
}

/** Contexto da requisição que os serviços precisam conhecer (sem depender de HTTP). */
export interface ContextoRequisicao {
  ip: string;
  userAgent: string;
}

/** O que é seguro expor ao navegador. */
export interface UsuarioPublico {
  id: string;
  nome: string;
  email: string;
  escritorio?: string;
  oab?: string;
  emailConfirmado: boolean;
  doisFatoresAtivo: boolean;
  codigosRecuperacaoRestantes: number;
  senhaAlteradaEm: string;
  criadoEm: string;
}

export function paraPublico(u: Usuario): UsuarioPublico {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    escritorio: u.escritorio,
    oab: u.oab,
    emailConfirmado: !!u.emailConfirmadoEm,
    doisFatoresAtivo: u.totpAtivo,
    codigosRecuperacaoRestantes: u.codigosRecuperacao.length,
    senhaAlteradaEm: u.senhaAlteradaEm,
    criadoEm: u.criadoEm,
  };
}

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}
