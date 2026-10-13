/**
 * Visão "Hoje": fila única das intimações com prazo, da mais urgente para a menos urgente.
 * Funções puras, testadas em tests/hoje.test.ts.
 */
import { FILTROS_VAZIOS, filtrarIntimacoes } from "./filtros.ts";
import { diasEntre } from "./prazos/datas.ts";
import type { Intimacao, StatusIntimacao } from "./types.ts";

/** "abertas" = nova ou em análise (o padrão); "todas" inclui respondidas e arquivadas. */
export type StatusHoje = "abertas" | "todas" | StatusIntimacao;

export interface FiltrosHoje {
  /** Nome do cliente monitorado (aba), ou vazio para todos. */
  cliente: string;
  status: StatusHoje;
  /** Id da pessoa, "nenhum" para sem responsável, ou vazio para todos. */
  responsavel: string;
  /** Busca livre, sem diferenciar acentos nem maiúsculas. */
  busca: string;
}

export const FILTROS_HOJE: FiltrosHoje = { cliente: "", status: "abertas", responsavel: "", busca: "" };

export type NivelUrgencia = "vencido" | "hoje" | "amanha" | "semana" | "depois";

export interface Urgencia {
  /** Dias até o prazo; negativo quando já venceu. */
  dias: number;
  nivel: NivelUrgencia;
  /** Texto do selo: "Vencido há 10 dias", "Vence hoje", "Vence amanhã", "Vence em 5 dias". */
  texto: string;
}

export function urgencia(prazo: string, hoje: string): Urgencia {
  const dias = diasEntre(hoje, prazo);
  if (dias < 0) return { dias, nivel: "vencido", texto: `Vencido há ${-dias} ${dias === -1 ? "dia" : "dias"}` };
  if (dias === 0) return { dias, nivel: "hoje", texto: "Vence hoje" };
  if (dias === 1) return { dias, nivel: "amanha", texto: "Vence amanhã" };
  return { dias, nivel: dias <= 7 ? "semana" : "depois", texto: `Vence em ${dias} dias` };
}

export const aberta = (i: Pick<Intimacao, "status">) => i.status === "nova" || i.status === "em_analise";

export interface ItemHoje {
  intimacao: Intimacao;
  urgencia: Urgencia;
}

/** Aplica status, responsável e busca (todos menos o cliente) às intimações com prazo. */
function semCliente(lista: Intimacao[], f: FiltrosHoje): Intimacao[] {
  const base = lista.filter((i) => i.prazo && (f.status === "todas" || (f.status === "abertas" ? aberta(i) : i.status === f.status)));
  return filtrarIntimacoes(base, { ...FILTROS_VAZIOS, busca: f.busca, responsavel: f.responsavel });
}

/** A fila: só intimações com prazo, ordenadas pelos dias restantes (vencidas primeiro). */
export function filaDeHoje(lista: Intimacao[], f: FiltrosHoje, hoje: string): ItemHoje[] {
  return semCliente(lista, f)
    .filter((i) => !f.cliente || i.cliente === f.cliente)
    .map((intimacao) => ({ intimacao, urgencia: urgencia(intimacao.prazo!, hoje) }))
    .sort((a, b) => a.urgencia.dias - b.urgencia.dias || a.intimacao.cliente.localeCompare(b.intimacao.cliente) || a.intimacao.numeroProcesso.localeCompare(b.intimacao.numeroProcesso));
}

export interface AbaCliente {
  cliente: string;
  total: number;
  /** Vencidas ou vencendo hoje, entre as abertas. */
  urgentes: number;
}

/**
 * Uma aba por cliente com itens na fila (com os demais filtros aplicados), e os clientes
 * monitorados mesmo sem itens, para a aba não sumir enquanto se filtra.
 */
export function abasPorCliente(lista: Intimacao[], f: FiltrosHoje, hoje: string, monitorados: string[] = []): AbaCliente[] {
  const abas = new Map<string, AbaCliente>(monitorados.map((c) => [c, { cliente: c, total: 0, urgentes: 0 }]));
  for (const i of semCliente(lista, f)) {
    const a = abas.get(i.cliente) ?? { cliente: i.cliente, total: 0, urgentes: 0 };
    a.total++;
    if (aberta(i) && urgencia(i.prazo!, hoje).dias <= 0) a.urgentes++;
    abas.set(i.cliente, a);
  }
  return [...abas.values()].sort((a, b) => b.urgentes - a.urgentes || b.total - a.total || a.cliente.localeCompare(b.cliente));
}

/** Para o número ao lado de "Hoje" no menu: abertas vencidas ou vencendo hoje. */
export function contarUrgentes(lista: Intimacao[], hoje: string): number {
  return lista.filter((i) => i.prazo && aberta(i) && diasEntre(hoje, i.prazo) <= 0).length;
}
