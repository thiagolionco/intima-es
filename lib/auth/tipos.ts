/** Formatos que a API de autenticação devolve ao navegador. */

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

export interface EventoAuditoria {
  id: string;
  tipo: string;
  em: string;
  ip: string;
  userAgent: string;
  detalhe?: string;
}

export type RespostaLogin = { etapa: "concluido"; usuario: UsuarioPublico } | { etapa: "segundo_fator"; desafio: string; expiraEm: string };
