/**
 * Assistente do caso: recebe um pedido em linguagem comum, propõe um plano com as ferramentas do
 * Clepsa, executa um passo de cada vez, revisa o resultado e entrega. O advogado aprova o plano antes.
 */
export const ACAO_AGENTE_LABEL = {
  analisar_risco: "Analisar o risco pelos PDFs",
  linha_do_tempo: "Montar a linha do tempo dos PDFs",
  providencias: "Listar as providências",
  pesquisar: "Pesquisar leis e jurisprudência",
  redigir_parecer: "Redigir o rascunho do parecer",
  verificar_citacoes: "Verificar as citações do parecer",
  resumo_cliente: "Escrever atualização para o cliente",
} as const;

export type AcaoAgente = keyof typeof ACAO_AGENTE_LABEL;

export const ACOES_AGENTE = Object.keys(ACAO_AGENTE_LABEL) as AcaoAgente[];

export type EstadoPasso = "pendente" | "feito" | "erro" | "pulado";

export interface PassoAgente {
  id: string;
  acao: AcaoAgente;
  /** O que o passo deve buscar, nas palavras do plano (vira a pergunta da pesquisa ou a orientação do parecer). */
  objetivo: string;
  estado: EstadoPasso;
  /** O que o passo produziu, em uma ou duas frases. */
  resumo?: string;
  /** Texto produzido (rascunho, atualização, resposta da pesquisa), para abrir ou copiar. */
  texto?: string;
  erro?: string;
  concluidoEm?: string;
}

export interface EntregaAgente {
  texto: string;
  /** O que ficou faltando ou precisa de conferência humana. */
  pendencias: string[];
  atendeu: boolean;
}

export interface ExecucaoAgente {
  id: string;
  processoId: string;
  pedido: string;
  explicacao: string;
  passos: PassoAgente[];
  entrega?: EntregaAgente;
  modelo: string;
  autorId: string;
  autorNome: string;
  criadoEm: string;
  atualizadoEm: string;
}

export const LIMITES_AGENTE = { pedido: 2000, passos: 6, porProcesso: 30 } as const;
