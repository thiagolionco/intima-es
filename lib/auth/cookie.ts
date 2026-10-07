/**
 * Nome do cookie de sessão. Em produção usamos o prefixo __Host-, que obriga Secure, Path=/
 * e proíbe Domain: o cookie não pode ser plantado por subdomínios. Módulo sem dependências
 * para poder ser usado também no middleware (runtime edge).
 */
export const NOME_COOKIE_SESSAO = process.env.NODE_ENV === "production" ? "__Host-ci_sessao" : "ci_sessao";
