export type StatusIntimacao = "nova" | "em_analise" | "respondida" | "arquivada";

export type OrigemIntimacao = "comunica" | "manual";

export interface Parte {
  nome: string;
  /** Polo processual: A (ativo), P (passivo) ou outro texto livre. */
  polo: string;
}

export interface Advogado {
  nome: string;
  oab: string;
  uf: string;
}

export interface Intimacao {
  id: string;
  origem: OrigemIntimacao;
  /** Identificador da comunicação no Comunica PJe (quando importada). */
  comunicaId?: string;
  hash?: string;
  /** Cliente/termo monitorado ao qual a intimação está vinculada. */
  cliente: string;
  tribunal: string;
  orgao: string;
  /** Data de disponibilização no formato AAAA-MM-DD. */
  dataDisponibilizacao: string;
  tipoComunicacao: string;
  meio: string;
  tipoDocumento: string;
  /** Classe processual (tipo de ação). */
  classe: string;
  numeroProcesso: string;
  partes: Parte[];
  advogados: Advogado[];
  texto: string;
  link?: string;
  status: StatusIntimacao;
  /** Prazo interno opcional, AAAA-MM-DD. */
  prazo?: string;
  observacoes?: string;
  createdAt: string;
  updatedAt: string;
}

export type TipoTermo = "parte" | "advogado" | "oab" | "processo";

/** Um cliente/termo que o usuário quer monitorar no Comunica PJe. */
export interface TermoMonitorado {
  id: string;
  /** Nome amigável do cliente (ex.: "Construtora Alfa"). */
  apelido: string;
  tipo: TipoTermo;
  /** Valor pesquisado: nome da parte, nome do advogado, número da OAB ou número do processo. */
  valor: string;
  /** UF da OAB, obrigatória quando tipo = "oab". */
  ufOab?: string;
  /** Sigla do tribunal para restringir a busca (opcional). */
  tribunal?: string;
  ativo: boolean;
  createdAt: string;
}

export interface FiltrosIntimacao {
  busca: string;
  dataInicio: string;
  dataFim: string;
  tipoComunicacao: string;
  status: StatusIntimacao | "";
  cliente: string;
  tribunal: string;
}
