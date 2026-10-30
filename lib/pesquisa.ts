/** Resultado da pesquisa jurídica pela IA nas fontes oficiais. */
export interface FontePesquisa {
  tipo: "legislacao" | "sumula" | "jurisprudencia";
  referencia: string;
  tribunal?: string;
  resumo: string;
  url: string;
}

export interface ResultadoPesquisa {
  pergunta: string;
  resposta: string;
  fontes: FontePesquisa[];
  /** Quantas páginas oficiais a IA abriu. */
  paginasConsultadas: number;
  modelo: string;
}
