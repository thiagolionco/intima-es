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
  /** Prazo interno opcional, AAAA-MM-DD. Quando há `regraPrazo`, é calculado a partir dela. */
  prazo?: string;
  /** Como o prazo foi calculado. Ausente quando a data foi informada à mão. */
  regraPrazo?: RegraPrazo;
  observacoes?: string;
  /** Pessoa da equipe responsável por cuidar desta intimação (id em `preferencias.equipe`). */
  responsavelId?: string;
  /** Quando foi entregue ao responsável atual (ISO). */
  delegadaEm?: string;
  /** Resumo em duas linhas gerado pelo servidor (só quando há ANTHROPIC_API_KEY). */
  resumo?: ResumoIntimacao;
  createdAt: string;
  updatedAt: string;
}

export interface ResumoIntimacao {
  /** Duas linhas: o que foi decidido e o que fazer. */
  texto: string;
  /** Quando foi gerado (ISO). */
  em: string;
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
  /** Resultado da última busca automática feita pelo servidor (só OAB e processo). */
  ultimaRonda?: UltimaRonda;
  /** Separação por atuação (só para clientes por OAB ou nome do advogado). Ver lib/atuacao.ts. */
  atuacao?: AtuacaoTermo;
}

/** Quem é o advogado de um cliente monitorado e quem são os colegas do escritório. */
export interface AtuacaoTermo {
  /** true: o advogado pesquisado é você. false: é um colega do escritório. */
  souEu: boolean;
  /** Outros advogados do mesmo escritório. Intimações só com eles e você não contam como atuação conjunta. */
  colegas: Advogado[];
}

export interface UltimaRonda {
  /** Quando a busca rodou (ISO). */
  em: string;
  /** Até que data de disponibilização (AAAA-MM-DD) a busca já cobriu sem falhas. */
  ate?: string;
  novas: number;
  erro?: string;
}

export interface FiltrosIntimacao {
  busca: string;
  dataInicio: string;
  dataFim: string;
  tipoComunicacao: string;
  status: StatusIntimacao | "";
  cliente: string;
  tribunal: string;
  /** Id da pessoa responsável, "nenhum" para as sem responsável, ou vazio para todas. */
  responsavel?: string;
  /** Tipo de tarefa sugerida (ver lib/tarefas.ts), ou vazio para todas. */
  tarefa?: string;
  /** Grupo de atuação (ver lib/atuacao.ts), ou vazio para todas. */
  atuacao?: string;
}

export type ContagemPrazo = "uteis" | "corridos";

/** Parâmetros do cálculo automático do prazo de uma intimação. */
export interface RegraPrazo {
  dias: number;
  contagem: ContagemPrazo;
  /** Prazo em dobro (Fazenda Pública, Ministério Público, Defensoria: arts. 180, 183 e 186 do CPC). */
  dobro: boolean;
  /** "texto": dias lidos do inteiro teor, ainda não conferidos; "usuario": informados ou confirmados pelo escritório. */
  fonte: "texto" | "usuario";
  /** Trecho do texto de onde os dias foram lidos. */
  trecho?: string;
}

/** Período sem contagem de prazos cadastrado pelo escritório (feriado local, portaria do tribunal…). */
export interface Suspensao {
  id: string;
  /** AAAA-MM-DD, inclusive. */
  inicio: string;
  /** AAAA-MM-DD, inclusive. */
  fim: string;
  descricao: string;
  /** Sigla do tribunal a que se aplica; vazio vale para todos. */
  tribunal?: string;
}

/** Avisos de prazo por e-mail. */
export interface PreferenciasAvisos {
  ativo: boolean;
  /** Com quantos dias úteis de antecedência avisar (0 = no próprio dia do vencimento). */
  diasAntes: number[];
  /** Hora de Brasília (0 a 23) a partir da qual o aviso do dia é enviado. */
  hora: number;
}

/** Alguém do escritório que pode receber intimações para cuidar. */
export interface PessoaEquipe {
  id: string;
  nome: string;
  email?: string;
  /** Conta do Clepsa ligada a esta pessoa (quem aceitou o convite). Ausente: só um nome na lista. */
  usuarioId?: string;
  /** Desativada: some das opções de delegar, mas continua nas intimações antigas. */
  inativa?: boolean;
}

export interface Preferencias {
  avisos?: PreferenciasAvisos;
  equipe?: PessoaEquipe[];
}

export const AVISOS_PADRAO: PreferenciasAvisos = { ativo: false, diasAntes: [3, 1, 0], hora: 7 };
