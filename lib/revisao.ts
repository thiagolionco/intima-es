/**
 * Revisão em tabela: cada processo é uma linha e cada pergunta é uma coluna. A IA lê os PDFs de
 * cada processo e preenche as células, sempre dizendo de onde tirou a resposta.
 */
export type FormatoPergunta = "texto" | "sim_nao" | "data" | "valor" | "risco";

export const FORMATO_PERGUNTA_LABEL: Record<FormatoPergunta, string> = {
  texto: "Texto curto",
  sim_nao: "Sim ou não",
  data: "Data",
  valor: "Valor em R$",
  risco: "Baixo, médio ou alto",
};

export interface PerguntaRevisao {
  id: string;
  texto: string;
  formato: FormatoPergunta;
}

export type EstadoCelula = "pendente" | "pronta" | "sem_resposta" | "erro";

export interface CelulaRevisao {
  resposta: string;
  justificativa?: string;
  fonte?: { documentoId: string; documentoNome: string; pagina: number };
  estado: EstadoCelula;
  /** Conferida por alguém do escritório. */
  revisada?: { por: string; em: string };
  /** Travada: a IA não reescreve ao rodar de novo. */
  travada?: boolean;
  /** Editada à mão. */
  editadaPor?: string;
}

export interface LinhaRevisao {
  processoId: string;
  /** Referência do processo no momento da revisão (o processo pode ter sido excluído depois). */
  rotulo: string;
  celulas: Record<string, CelulaRevisao>;
  executadaEm?: string;
  erro?: string;
}

export interface RevisaoTabela {
  id: string;
  titulo: string;
  perguntas: PerguntaRevisao[];
  linhas: LinhaRevisao[];
  modelo?: string;
  autorId: string;
  autorNome: string;
  criadoEm: string;
  atualizadoEm: string;
}

/** Conjunto de perguntas salvo para reaproveitar. */
export interface ModeloRevisao {
  id: string;
  titulo: string;
  perguntas: Omit<PerguntaRevisao, "id">[];
  autorNome: string;
  criadoEm: string;
}

export const LIMITES_REVISAO = { titulo: 150, pergunta: 300, perguntas: 15, linhas: 60, resposta: 600, justificativa: 800, porEscritorio: 200 } as const;

/** Modelos de perguntas prontos. */
export const MODELOS_REVISAO_PRONTOS: Omit<ModeloRevisao, "id" | "autorNome" | "criadoEm">[] = [
  {
    titulo: "Carteira de consumidor",
    perguntas: [
      { texto: "Qual o valor da causa ou do dano pedido?", formato: "valor" },
      { texto: "Há pedido de tutela de urgência? Foi deferida?", formato: "texto" },
      { texto: "Houve negativação do nome do cliente?", formato: "sim_nao" },
      { texto: "Qual a data do fato principal?", formato: "data" },
      { texto: "Há prova documental do pagamento ou da falha?", formato: "sim_nao" },
      { texto: "Qual o risco para o cliente?", formato: "risco" },
    ],
  },
  {
    titulo: "Reclamatórias trabalhistas",
    perguntas: [
      { texto: "Data de admissão e de dispensa", formato: "texto" },
      { texto: "Há pedido de horas extras?", formato: "sim_nao" },
      { texto: "Há pedido de insalubridade ou periculosidade?", formato: "sim_nao" },
      { texto: "Valor atribuído à causa", formato: "valor" },
      { texto: "Há risco de prescrição bienal ou quinquenal?", formato: "texto" },
      { texto: "Qual o risco para o cliente?", formato: "risco" },
    ],
  },
  {
    titulo: "Situação processual",
    perguntas: [
      { texto: "Em que fase o processo está?", formato: "texto" },
      { texto: "Qual a última decisão relevante?", formato: "texto" },
      { texto: "Há prazo em aberto para o escritório?", formato: "texto" },
      { texto: "Há audiência marcada? Quando?", formato: "data" },
    ],
  },
];

/** Tabela em CSV (separador ;, como o Excel em português espera). */
export function revisaoEmCsv(r: Pick<RevisaoTabela, "perguntas" | "linhas">): string {
  const celula = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const cabecalho = ["Processo", ...r.perguntas.flatMap((p) => [p.texto, `${p.texto} (fonte)`])];
  const linhas = r.linhas.map((l) => [
    l.rotulo,
    ...r.perguntas.flatMap((p) => {
      const c = l.celulas[p.id];
      return [c?.resposta ?? "", c?.fonte ? `${c.fonte.documentoNome}, p. ${c.fonte.pagina}` : ""];
    }),
  ]);
  return `${[cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n")}\r\n`;
}
