import { naoEncontradoEmMarkdown, paginaEmMarkdown } from "./markdown.ts";
import { paginaPublica } from "./conteudo.ts";
import { prefereMarkdown } from "./negociacao.ts";

/** Endereço interno da página inicial pública; o middleware a serve em "/" para quem não entrou. */
export const CAMINHO_INICIO_PUBLICO = "/inicio";

/** Destino de reescrita que nunca corresponde a uma página (pastas com "_" são privadas no Next). */
export const CAMINHO_INEXISTENTE = "/_nao-encontrado";

/** Arquivos para robôs e agentes, sempre abertos. */
export const ARQUIVOS_PUBLICOS = ["/sitemap.xml", "/robots.txt", "/opengraph-image"];

/**
 * Primeiro segmento de cada endereço que existe no app. Um teste confere que toda pasta de
 * app/ está aqui; o que ficar de fora responde 404 em vez de mandar para a tela de login.
 */
export const SEGMENTOS_CONHECIDOS = new Set([
  // app/(app): telas com login
  "administracao", "biblioteca", "clientes", "comunica", "conta", "dados", "equipe", "fluxos", "hoje", "intimacoes", "pedidos", "prazos", "processos", "relatorios",
  // app/(auth): telas de acesso
  "confirmar-email", "convite", "criar-conta", "cumprir", "entrar", "esqueci-a-senha", "redefinir-senha", "verifique-seu-email",
  // páginas abertas (portal do cliente, formulário, segurança) e o site público
  "portal", "pedido", "seguranca", "inicio", "sobre", "contato", "privacidade",
  // infraestrutura
  "api", "dev", "_next",
  ...ARQUIVOS_PUBLICOS.map((a) => a.slice(1)),
]);

export type DecisaoPublica =
  | { tipo: "markdown"; status: 200 | 404; corpo: string }
  | { tipo: "reescrever"; para: string; status?: 404 }
  | { tipo: "seguir" }
  | null;

function semBarraFinal(caminho: string): string {
  return caminho.length > 1 ? caminho.replace(/\/+$/, "") : caminho;
}

/**
 * Decide o que fazer com páginas públicas, arquivos para agentes e endereços inexistentes.
 * `null` devolve a requisição às regras normais de login do middleware.
 */
export function decidirRotaPublica(pathname: string, accept: string | null, temSessao: boolean): DecisaoPublica {
  const caminho = semBarraFinal(pathname);
  const pagina = paginaPublica(caminho === CAMINHO_INICIO_PUBLICO ? "/" : caminho);

  if (pagina) {
    if (prefereMarkdown(accept)) return { tipo: "markdown", status: 200, corpo: paginaEmMarkdown(pagina) };
    if (caminho === "/") return temSessao ? { tipo: "seguir" } : { tipo: "reescrever", para: CAMINHO_INICIO_PUBLICO };
    return { tipo: "seguir" };
  }
  if (ARQUIVOS_PUBLICOS.includes(caminho)) return { tipo: "seguir" };

  const segmento = caminho.split("/")[1] ?? "";
  if (!SEGMENTOS_CONHECIDOS.has(segmento)) {
    return prefereMarkdown(accept) ? { tipo: "markdown", status: 404, corpo: naoEncontradoEmMarkdown(caminho) } : { tipo: "reescrever", para: CAMINHO_INEXISTENTE, status: 404 };
  }
  return null;
}
