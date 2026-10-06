import type { StatusIntimacao, TipoTermo } from "./types";

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Data de hoje em AAAA-MM-DD, no fuso local. */
export function hojeISO(): string {
  return toISODate(new Date());
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Converte AAAA-MM-DD em Date local (sem deslocamento de fuso). */
export function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getMonth() !== Number(m[2]) - 1) return null;
  return d;
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso) ?? new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function diffDays(fromISO: string, toISO: string): number {
  const a = parseISODate(fromISO);
  const b = parseISODate(toISO);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = parseISODate(iso.slice(0, 10));
  if (!d) return iso;
  return d.toLocaleDateString("pt-BR");
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const STATUS_LABEL: Record<StatusIntimacao, string> = {
  nova: "Nova",
  em_analise: "Em análise",
  respondida: "Respondida",
  arquivada: "Arquivada",
};

export const STATUS_STYLE: Record<StatusIntimacao, string> = {
  nova: "bg-blue-50 text-blue-700 ring-blue-600/20",
  em_analise: "bg-amber-50 text-amber-800 ring-amber-600/20",
  respondida: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  arquivada: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export const STATUS_ORDER: StatusIntimacao[] = ["nova", "em_analise", "respondida", "arquivada"];

export const TIPO_TERMO_LABEL: Record<TipoTermo, string> = {
  parte: "Nome da parte",
  advogado: "Nome do advogado",
  oab: "Número da OAB",
  processo: "Número do processo",
};

export const TIPOS_COMUNICACAO_PADRAO = ["Intimação", "Citação", "Edital", "Lista de distribuição", "Notificação"];

export const MEIOS = [
  { value: "D", label: "Diário de Justiça Eletrônico Nacional" },
  { value: "E", label: "Plataforma de Editais" },
];

export function meioLabel(meio: string): string {
  return MEIOS.find((m) => m.value === meio)?.label ?? meio ?? "—";
}

export function poloLabel(polo: string): string {
  const p = (polo ?? "").toUpperCase();
  if (p === "A") return "Polo ativo";
  if (p === "P") return "Polo passivo";
  return polo || "Parte";
}

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

/** Remove acentos e passa para minúsculas, para buscas tolerantes. */
export function normalizar(s: string): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Remove tags HTML simples que às vezes aparecem no inteiro teor. */
export function textoPlano(s: string): string {
  return (s ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function resumo(texto: string, max = 220): string {
  const t = textoPlano(texto).replace(/\s+/g, " ");
  return t.length > max ? t.slice(0, max).trimEnd() + "…" : t;
}

/** Formata número CNJ (20 dígitos) como NNNNNNN-DD.AAAA.J.TR.OOOO. */
export function formatProcesso(n: string): string {
  const d = (n ?? "").replace(/\D/g, "");
  if (d.length !== 20) return n;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
}
