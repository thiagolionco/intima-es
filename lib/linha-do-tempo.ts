import type { AnaliseRisco, MovimentacoesProcesso, ParecerProcesso } from "./processos.ts";
import { NIVEL_RISCO_LABEL } from "./processos.ts";
import type { Intimacao } from "./types.ts";
import { formatDate } from "./utils.ts";

/** Fato tirado dos PDFs pela IA, sempre com documento e página para conferir. */
export interface FatoProcesso {
  /** AAAA-MM-DD, ou AAAA-MM quando o documento só dá o mês. */
  data: string;
  descricao: string;
  documentoId: string;
  documentoNome: string;
  pagina: number;
}

export interface FatosDoProcesso {
  processoId: string;
  fatos: FatoProcesso[];
  documentos: { id: string; nome: string }[];
  modelo: string;
  autorNome: string;
  criadoEm: string;
}

/** E-mail, ligação ou anotação colada no processo (a parte "Outlook" da linha do tempo). */
export interface NotaProcesso {
  id: string;
  processoId: string;
  tipo: "email" | "anotacao" | "ligacao" | "reuniao";
  /** AAAA-MM-DD do fato (do e-mail, da reunião); por padrão, o dia em que foi colada. */
  data: string;
  titulo: string;
  texto: string;
  /** Resumo e próximas ações pela IA, quando ligada. */
  resumo?: string;
  acoes?: string[];
  /** Mostrada também no portal do cliente. */
  visivelAoCliente: boolean;
  autorId: string;
  autorNome: string;
  criadoEm: string;
}

export const TIPO_NOTA_LABEL: Record<NotaProcesso["tipo"], string> = {
  email: "E-mail",
  anotacao: "Anotação",
  ligacao: "Ligação",
  reuniao: "Reunião",
};

export const LIMITES_NOTA = { titulo: 200, texto: 30_000, porProcesso: 500 } as const;

export type OrigemEvento = "andamento" | "intimacao" | "fato" | "nota" | "escritorio";

export const ORIGEM_EVENTO_LABEL: Record<OrigemEvento, string> = {
  andamento: "Andamentos (DataJud)",
  intimacao: "Intimações",
  fato: "Fatos dos PDFs",
  nota: "E-mails e anotações",
  escritorio: "Escritório",
};

export interface EventoLinhaDoTempo {
  id: string;
  origem: OrigemEvento;
  /** Para ordenar: AAAA-MM-DD ou data e hora ISO. */
  quando: string;
  titulo: string;
  detalhe?: string;
  /** De onde veio, para conferir. */
  fonte?: string;
  /** Página do PDF, para abrir no ponto certo. */
  documentoId?: string;
  pagina?: number;
  notaId?: string;
}

export interface EntradaLinhaDoTempo {
  movimentacoes?: MovimentacoesProcesso | null;
  intimacoes?: Intimacao[];
  fatos?: FatosDoProcesso | null;
  notas?: NotaProcesso[];
  pareceres?: ParecerProcesso[];
  analises?: AnaliseRisco[];
  dataAtendimento?: string;
  dataProtocolo?: string;
}

/** Junta tudo o que aconteceu no processo numa linha só, do mais novo para o mais antigo. */
export function montarLinhaDoTempo(e: EntradaLinhaDoTempo): EventoLinhaDoTempo[] {
  const eventos: EventoLinhaDoTempo[] = [];
  for (const [i, m] of (e.movimentacoes?.movimentos ?? []).entries()) {
    eventos.push({
      id: `andamento-${i}-${m.dataHora}`,
      origem: "andamento",
      quando: m.dataHora,
      titulo: m.nome,
      detalhe: [m.complementos?.join(" · "), [m.grau, m.orgao].filter(Boolean).join(" · ")].filter(Boolean).join("\n") || undefined,
      fonte: "DataJud (CNJ)",
    });
  }
  for (const i of e.intimacoes ?? []) {
    eventos.push({
      id: `intimacao-${i.id}`,
      origem: "intimacao",
      quando: i.dataDisponibilizacao,
      titulo: `${i.tipoComunicacao || "Intimação"}${i.orgao ? ` · ${i.orgao}` : ""}`,
      detalhe: [i.resumo?.texto, i.prazo && `Prazo: ${formatDate(i.prazo)}`].filter(Boolean).join("\n") || undefined,
      fonte: i.origem === "comunica" ? "Comunica PJe" : "Cadastrada no Clepsa",
    });
  }
  for (const [i, f] of (e.fatos?.fatos ?? []).entries()) {
    eventos.push({
      id: `fato-${i}`,
      origem: "fato",
      quando: f.data.length === 7 ? `${f.data}-01` : f.data,
      titulo: f.descricao,
      fonte: `${f.documentoNome}, p. ${f.pagina}`,
      documentoId: f.documentoId,
      pagina: f.pagina,
    });
  }
  for (const n of e.notas ?? []) {
    eventos.push({
      id: `nota-${n.id}`,
      origem: "nota",
      quando: n.data,
      titulo: `${TIPO_NOTA_LABEL[n.tipo]}: ${n.titulo}`,
      detalhe: n.resumo ?? (n.texto.length > 400 ? `${n.texto.slice(0, 400)}…` : n.texto),
      fonte: n.autorNome,
      notaId: n.id,
    });
  }
  for (const p of e.pareceres ?? []) {
    eventos.push({ id: `parecer-${p.id}`, origem: "escritorio", quando: p.criadoEm, titulo: `Parecer, versão ${p.versao}`, fonte: p.autorNome });
  }
  for (const a of e.analises ?? []) {
    eventos.push({ id: `analise-${a.id}`, origem: "escritorio", quando: a.criadoEm, titulo: `Análise de risco pela IA: ${NIVEL_RISCO_LABEL[a.nivel]}`, detalhe: a.justificativa, fonte: a.autorNome });
  }
  if (e.dataAtendimento) eventos.push({ id: "atendimento", origem: "escritorio", quando: e.dataAtendimento, titulo: "Atendimento do cliente" });
  if (e.dataProtocolo) eventos.push({ id: "protocolo", origem: "escritorio", quando: e.dataProtocolo, titulo: "Protocolo" });
  return eventos.sort((a, b) => b.quando.localeCompare(a.quando));
}

/** Cronologia em texto, do mais antigo para o mais novo, para colar na peça. */
export function cronologiaEmTexto(eventos: EventoLinhaDoTempo[]): string {
  return [...eventos]
    .reverse()
    .map((ev) => {
      const dia = ev.quando.slice(0, 10);
      return `${formatDate(dia)} – ${ev.titulo}${ev.fonte ? ` (${ev.fonte})` : ""}`;
    })
    .join("\n");
}
