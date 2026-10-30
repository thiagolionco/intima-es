import type { AreaAtuacao } from "./processos.ts";

/** Pedidos que chegam ao escritório (formulário público, portal do cliente ou cadastro à mão). */
export type OrigemPedido = "formulario" | "portal" | "manual";

export const ORIGEM_PEDIDO_LABEL: Record<OrigemPedido, string> = {
  formulario: "Formulário de atendimento",
  portal: "Portal do cliente",
  manual: "Cadastrado no Clepsa",
};

export type StatusPedido = "novo" | "em_analise" | "respondido" | "convertido" | "arquivado";

export const STATUS_PEDIDO_LABEL: Record<StatusPedido, string> = {
  novo: "Novo",
  em_analise: "Em análise",
  respondido: "Respondido",
  convertido: "Virou caso",
  arquivado: "Arquivado",
};

export type Urgencia = "baixa" | "media" | "alta";

export const URGENCIA_LABEL: Record<Urgencia, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };

export interface TriagemPedido {
  area?: AreaAtuacao;
  urgencia: Urgencia;
  resumo: string;
  /** O que um advogado perguntaria antes de aceitar o caso. */
  perguntas: string[];
  /** Prazo ou risco de prescrição aparente, quando o relato indica. */
  alertaPrazo?: string;
  modelo: string;
  feitaEm: string;
}

export interface Pedido {
  id: string;
  origem: OrigemPedido;
  nome: string;
  contato: string;
  assunto: string;
  descricao: string;
  status: StatusPedido;
  responsavelId?: string;
  triagem?: TriagemPedido;
  /** Processo criado a partir do pedido. */
  processoId?: string;
  /** Do portal: o processo de que o cliente falava. */
  processoOrigemId?: string;
  historico: { quando: string; quem: string; acao: string }[];
  criadoEm: string;
  atualizadoEm: string;
}

/** Link do formulário público de atendimento do escritório. */
export interface FormularioPedidos {
  id: string;
  ativo: boolean;
  titulo: string;
  /** Texto de apresentação mostrado no formulário. */
  apresentacao?: string;
  recebidos: number;
  autorNome: string;
  criadoEm: string;
}

export const LIMITES_PEDIDO = { nome: 120, contato: 200, assunto: 200, descricao: 8000, porEscritorio: 3000 } as const;
