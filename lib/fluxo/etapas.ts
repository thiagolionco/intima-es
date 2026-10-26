import { FASES, type FaseProcesso, type Processo } from "../processos.ts";

/**
 * Esteira da Central de casos. As etapas são as fases do processo (a coluna `fase` continua
 * sendo a fonte da verdade); o que a Central acrescenta é o que se exige em cada uma.
 * Tudo aqui é dado: acrescentar um item ou mudar um prazo não mexe no motor.
 */

/** Item do checklist da etapa. `automatico` é conferido pelos dados do processo, não marcado à mão. */
export interface ModeloItem {
  id: string;
  rotulo: string;
  /** Impede avançar enquanto não estiver feito. */
  bloqueante: boolean;
  automatico?: (p: Processo) => boolean;
  dica?: string;
}

export interface DefinicaoEtapa {
  id: FaseProcesso;
  rotulo: string;
  /** Rótulo curto para espaços apertados. */
  sigla: string;
  descricao: string;
  /** Dias que um caso deveria ficar nesta etapa; sem prazo, não envelhece. */
  prazoDias?: number;
  checklist: ModeloItem[];
}

const temPrescricao = (p: Processo) => Boolean(p.prescricao);
const temResponsavel = (p: Processo) => Boolean(p.responsavelId);
const temValor = (p: Processo) => p.valorCausa !== undefined;
const temClassificacao = (p: Processo) => Boolean(p.area && p.tipo);

const fase = (id: FaseProcesso) => FASES.find((f) => f.id === id)!;

export const ETAPAS: readonly DefinicaoEtapa[] = [
  {
    id: "triagem",
    rotulo: fase("triagem").rotulo,
    sigla: "TRI",
    descricao: fase("triagem").descricao,
    prazoDias: 5,
    checklist: [
      { id: "tri.documentos", rotulo: "Documentos pessoais do cliente recebidos", bloqueante: true },
      { id: "tri.procuracao", rotulo: "Procuração assinada", bloqueante: true },
      { id: "tri.honorarios", rotulo: "Contrato de honorários assinado", bloqueante: true },
      { id: "tri.prescricao", rotulo: "Prescrição calculada", bloqueante: false, automatico: temPrescricao, dica: "Preencha a data de prescrição no cadastro." },
      { id: "tri.classificacao", rotulo: "Área e tipo de demanda definidos", bloqueante: false, automatico: temClassificacao, dica: "Preencha área e tipo no cadastro." },
    ],
  },
  {
    id: "elaboracao",
    rotulo: fase("elaboracao").rotulo,
    sigla: "ELA",
    descricao: fase("elaboracao").descricao,
    prazoDias: 10,
    checklist: [
      { id: "ela.tese", rotulo: "Tese jurídica definida", bloqueante: true },
      { id: "ela.jurisprudencia", rotulo: "Jurisprudência pesquisada", bloqueante: false },
      { id: "ela.provas", rotulo: "Provas organizadas e numeradas", bloqueante: true },
      { id: "ela.calculos", rotulo: "Cálculos e valor da causa", bloqueante: false, automatico: temValor, dica: "Preencha o valor da causa no cadastro." },
      { id: "ela.minuta", rotulo: "Minuta da peça concluída", bloqueante: true },
    ],
  },
  {
    id: "correcao",
    rotulo: fase("correcao").rotulo,
    sigla: "COR",
    descricao: fase("correcao").descricao,
    prazoDias: 3,
    checklist: [
      { id: "cor.revisao", rotulo: "Revisada por outro advogado", bloqueante: true, dica: "Quatro olhos antes de protocolar." },
      { id: "cor.pedidos", rotulo: "Pedidos conferidos", bloqueante: true },
      { id: "cor.anexos", rotulo: "Anexos conferidos e legíveis", bloqueante: true },
      { id: "cor.custas", rotulo: "Custas recolhidas ou gratuidade pedida", bloqueante: true },
      { id: "cor.responsavel", rotulo: "Responsável pelo protocolo definido", bloqueante: false, automatico: temResponsavel, dica: "Escolha o responsável na ficha." },
    ],
  },
  {
    id: "protocolado",
    rotulo: fase("protocolado").rotulo,
    sigla: "PRT",
    descricao: fase("protocolado").descricao,
    checklist: [
      { id: "prt.cliente", rotulo: "Cliente avisado do protocolo", bloqueante: false },
      { id: "prt.monitoramento", rotulo: "Número cadastrado no monitoramento do Comunica", bloqueante: false },
    ],
  },
];

export const ORDEM: readonly FaseProcesso[] = ETAPAS.map((e) => e.id);

export function etapa(id: FaseProcesso): DefinicaoEtapa {
  const e = ETAPAS.find((x) => x.id === id);
  if (!e) throw new Error(`Etapa desconhecida: ${id}`);
  return e;
}

export const indiceEtapa = (id: FaseProcesso) => ORDEM.indexOf(id);
export const proximaEtapa = (id: FaseProcesso): FaseProcesso | undefined => ORDEM[indiceEtapa(id) + 1];
export const etapaAnterior = (id: FaseProcesso): FaseProcesso | undefined => (indiceEtapa(id) > 0 ? ORDEM[indiceEtapa(id) - 1] : undefined);

export function ehEtapa(v: unknown): v is FaseProcesso {
  return typeof v === "string" && (ORDEM as readonly string[]).includes(v);
}

/** Acha o item em qualquer etapa; serve para validar o que chega do navegador. */
export function modeloDoItem(itemId: string): { etapa: FaseProcesso; item: ModeloItem } | undefined {
  for (const e of ETAPAS) {
    const item = e.checklist.find((i) => i.id === itemId);
    if (item) return { etapa: e.id, item };
  }
  return undefined;
}
