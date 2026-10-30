/** Providências do processo: o que precisa ser feito, com responsável, prazo e de onde saiu. */
export type SituacaoProvidencia = "pendente" | "feita" | "descartada";

export const SITUACAO_PROVIDENCIA_LABEL: Record<SituacaoProvidencia, string> = {
  pendente: "Pendente",
  feita: "Feita",
  descartada: "Descartada",
};

export interface RegistroHistorico {
  quando: string;
  quem: string;
  acao: string;
}

export interface Providencia {
  id: string;
  descricao: string;
  /** Artigo, cláusula ou decisão que pede a providência. */
  fundamento?: string;
  /** De onde a IA tirou: PDF e página. Ausente quando foi incluída à mão. */
  fonte?: { documentoId: string; documentoNome: string; pagina: number };
  prazo?: string;
  responsavelId?: string;
  situacao: SituacaoProvidencia;
  /** Sugerida pela IA e ainda não confirmada por ninguém. */
  sugerida: boolean;
  historico: RegistroHistorico[];
  criadoEm: string;
}

export interface ProvidenciasDoProcesso {
  processoId: string;
  itens: Providencia[];
  atualizadoEm: string;
}

export const LIMITES_PROVIDENCIAS = { descricao: 500, fundamento: 300, itens: 200, historico: 50 } as const;

/** Pendentes primeiro (as com prazo mais perto no topo), depois feitas e descartadas. */
export function ordenarProvidencias(itens: Providencia[]): Providencia[] {
  const peso: Record<SituacaoProvidencia, number> = { pendente: 0, feita: 1, descartada: 2 };
  return [...itens].sort((a, b) => peso[a.situacao] - peso[b.situacao] || (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999") || a.criadoEm.localeCompare(b.criadoEm));
}
