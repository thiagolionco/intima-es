/**
 * Erro de aplicação com código estável (consumido pela interface) e status HTTP.
 * Os serviços lançam AppError; só a camada HTTP sabe transformá-lo em resposta.
 */
export type CodigoErro =
  | "dados_invalidos"
  | "nao_autenticado"
  | "credenciais_invalidas"
  | "email_nao_confirmado"
  | "conta_bloqueada"
  | "muitas_tentativas"
  | "token_invalido"
  | "codigo_invalido"
  | "desafio_expirado"
  | "senha_fraca"
  | "senha_atual_incorreta"
  | "conflito"
  | "nao_encontrado"
  | "origem_invalida"
  | "indisponivel";

const STATUS: Record<CodigoErro, number> = {
  dados_invalidos: 400,
  nao_autenticado: 401,
  credenciais_invalidas: 401,
  email_nao_confirmado: 403,
  conta_bloqueada: 423,
  muitas_tentativas: 429,
  token_invalido: 400,
  codigo_invalido: 401,
  desafio_expirado: 401,
  senha_fraca: 400,
  senha_atual_incorreta: 400,
  conflito: 409,
  nao_encontrado: 404,
  origem_invalida: 403,
  indisponivel: 404,
};

export class AppError extends Error {
  readonly codigo: CodigoErro;
  readonly status: number;
  readonly detalhes?: Record<string, unknown>;

  constructor(codigo: CodigoErro, mensagem: string, detalhes?: Record<string, unknown>) {
    super(mensagem);
    this.name = "AppError";
    this.codigo = codigo;
    this.status = STATUS[codigo];
    this.detalhes = detalhes;
  }
}
