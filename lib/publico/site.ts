/**
 * Identidade pública do Clepsa: o que pode aparecer para visitantes, buscadores e agentes de IA.
 * Módulo sem dependências, usado também no middleware (runtime edge) e nos testes.
 */

/** Endereço principal do site. Na Vercel vem do domínio de produção do projeto. */
export const URL_DO_SITE = (
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://clepsa.vercel.app")
).replace(/\/+$/, "");

export const NOME = "Clepsa";
export const TITULO_PRINCIPAL = "Clepsa: monitoramento de intimações e prazos para escritórios de advocacia";
export const DESCRICAO =
  "O Clepsa acompanha as intimações publicadas no Comunica PJe (Diário de Justiça Eletrônico Nacional) para os clientes do escritório, organiza os prazos e avisa a equipe antes que eles vençam.";

/**
 * Dados de contato e endereço publicados no JSON-LD e na página /contato.
 * Ficam vazios até o responsável pelo Clepsa decidir o que divulgar: nada aqui é inventado.
 */
export const CONTATO: { email: string | null; telefone: string | null; endereco: null | { rua: string; cidade: string; estado: string; cep: string; pais: string } } = {
  email: null,
  telefone: null,
  endereco: null,
};

export function urlAbsoluta(caminho: string): string {
  return caminho === "/" ? `${URL_DO_SITE}/` : `${URL_DO_SITE}${caminho}`;
}
