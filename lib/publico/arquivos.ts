import { PAGINAS_PUBLICAS } from "./conteudo.ts";
import { urlAbsoluta } from "./site.ts";

/** Data da última revisão do texto das páginas públicas (lib/publico/conteudo.ts). */
export const REVISAO_DO_CONTEUDO = "2026-10-30";

export function entradasDoSitemap() {
  return PAGINAS_PUBLICAS.map((p) => ({
    url: urlAbsoluta(p.caminho),
    lastModified: REVISAO_DO_CONTEUDO,
    changeFrequency: "monthly" as const,
    priority: p.caminho === "/" ? 1 : 0.6,
  }));
}
