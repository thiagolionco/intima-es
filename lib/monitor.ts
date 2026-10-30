import type { AreaAtuacao } from "./processos.ts";

/**
 * Monitor de precedentes: o escritório escolhe temas (ex.: "negativação indevida", "Tema 1.061/STJ")
 * e a IA procura toda semana, nas fontes oficiais, súmulas, temas e decisões novas sobre eles.
 */
export interface MonitorPrecedentes {
  id: string;
  tema: string;
  /** O que interessa: tese, pedido, área. Ajuda a IA a separar o que importa. */
  descricao?: string;
  area?: AreaAtuacao;
  /** Siglas (STF, STJ, TST, TJSP…). Vazio: tribunais superiores. */
  tribunais: string[];
  /** Processos que o tema afeta, para avisar no alerta. */
  processoIds: string[];
  ativo: boolean;
  frequenciaDias: number;
  ultimaVerificacao?: string;
  ultimoErro?: string;
  autorNome: string;
  criadoEm: string;
}

export type StatusAlerta = "novo" | "lido" | "arquivado";

export type ImpactoAlerta = "baixo" | "medio" | "alto";

export const IMPACTO_ALERTA_LABEL: Record<ImpactoAlerta, string> = { baixo: "Impacto baixo", medio: "Impacto médio", alto: "Impacto alto" };

export interface AlertaPrecedente {
  id: string;
  monitorId: string;
  tema: string;
  titulo: string;
  resumo: string;
  referencia?: string;
  tribunal?: string;
  /** Data da decisão ou publicação, AAAA-MM-DD, quando a fonte informa. */
  data?: string;
  url: string;
  impacto: ImpactoAlerta;
  /** Por que importa para os processos do escritório. */
  porQueImporta?: string;
  processoIds: string[];
  status: StatusAlerta;
  responsavelId?: string;
  criadoEm: string;
}

export const LIMITES_MONITOR = { tema: 200, descricao: 1500, tribunais: 10, porEscritorio: 40, alertasPorVerificacao: 10, alertas: 1000 } as const;
