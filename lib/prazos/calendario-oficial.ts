import type { Suspensao } from "../types.ts";
import { emRecesso, feriadosDoAno } from "./calendario.ts";
import { dataValida, diaDaSemana, somarDias } from "./datas.ts";

/**
 * Dias sem expediente lidos do calendário publicado pelo tribunal. Servem para o advogado ver e
 * escolher o que entra no cálculo: nada daqui conta prazo sozinho, porque a leitura pode errar e um
 * dia a mais no calendário empurra o vencimento para depois do real.
 */

export type Abrangencia = "nacional" | "estadual" | "municipal" | "orgao";

export interface DiaOficial {
  /** AAAA-MM-DD, inclusive. */
  inicio: string;
  /** AAAA-MM-DD, inclusive. */
  fim: string;
  descricao: string;
  abrangencia: Abrangencia;
  /** Município, comarca, subseção ou vara, quando não vale para o tribunal todo. */
  local?: string;
  /** Portaria, decreto ou lei citada pelo tribunal. */
  base?: string;
}

export interface CalendarioOficial {
  tribunal: string;
  ano: number;
  dias: DiaOficial[];
  /** Páginas e arquivos de onde os dias foram lidos. */
  fontes: string[];
  /** Quando a leitura foi feita (ISO). */
  lidoEm: string;
}

export const NOMES_ABRANGENCIA: Record<Abrangencia, string> = {
  nacional: "Nacional",
  estadual: "Todo o tribunal",
  municipal: "Município",
  orgao: "Vara ou órgão",
};

const ABRANGENCIAS = Object.keys(NOMES_ABRANGENCIA) as Abrangencia[];
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Confere o que veio da leitura: datas válidas, do ano pedido, sem repetição. */
export function limparDiasOficiais(brutos: unknown, ano: number): DiaOficial[] {
  if (!Array.isArray(brutos)) return [];
  const vistos = new Set<string>();
  const dias: DiaOficial[] = [];
  for (const b of brutos as Record<string, unknown>[]) {
    if (!b || typeof b !== "object") continue;
    const inicio = texto(b.inicio, 10);
    const fim = texto(b.fim, 10) || inicio;
    const descricao = texto(b.descricao, 200);
    if (!dataValida(inicio) || !dataValida(fim) || fim < inicio || !descricao) continue;
    // Um período que atravessa o ano fica só com a parte do ano pedido.
    const i = inicio < `${ano}-01-01` ? `${ano}-01-01` : inicio;
    const f = fim > `${ano}-12-31` ? `${ano}-12-31` : fim;
    if (i > f) continue;
    const abrangencia = ABRANGENCIAS.includes(b.abrangencia as Abrangencia) ? (b.abrangencia as Abrangencia) : "estadual";
    const local = abrangencia === "municipal" || abrangencia === "orgao" ? texto(b.local, 120) : "";
    const base = texto(b.base, 160);
    const chave = `${i}|${f}|${local.toLowerCase()}|${descricao.toLowerCase()}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    dias.push({ inicio: i, fim: f, descricao, abrangencia, ...(local ? { local } : {}), ...(base ? { base } : {}) });
  }
  return dias.sort((a, b) => a.inicio.localeCompare(b.inicio) || (a.local ?? "").localeCompare(b.local ?? ""));
}

/**
 * Tira o que o Clepsa já desconta sozinho: fins de semana, feriados nacionais e o recesso de
 * 20/12 a 20/01. Fica o que o tribunal acrescenta.
 */
export function soOQueAcrescenta(dias: DiaOficial[], tribunal: string): DiaOficial[] {
  const nacionais = new Map<number, Set<string>>();
  const jaConta = (d: string) => {
    const ano = Number(d.slice(0, 4));
    if (!nacionais.has(ano)) nacionais.set(ano, new Set(feriadosDoAno(ano, tribunal).map((f) => f.data)));
    const dia = diaDaSemana(d);
    return dia === 0 || dia === 6 || emRecesso(d) || nacionais.get(ano)!.has(d);
  };
  return dias.filter((x) => {
    for (let d = x.inicio; d <= x.fim; d = somarDias(d, 1)) if (!jaConta(d)) return true;
    return false;
  });
}

/** Chave estável de um dia oficial: período e o texto que vai para o cadastro. */
export function chaveDiaOficial(d: DiaOficial): string {
  return `${d.inicio}|${d.fim}|${descricaoDoDia(d)}`;
}

/** Chaves dos dias que o escritório já cadastrou para o tribunal a partir do calendário. */
export function jaCadastrados(dias: DiaOficial[], suspensoes: Suspensao[], tribunal: string): Set<string> {
  const existentes = new Set(suspensoes.filter((s) => (s.tribunal ?? "") === tribunal).map((s) => `${s.inicio}|${s.fim}|${s.descricao}`));
  return new Set(dias.map(chaveDiaOficial).filter((k) => existentes.has(k)));
}

/** Descrição gravada no cadastro: o motivo e, se houver, o local. */
export function descricaoDoDia(d: DiaOficial): string {
  return d.local ? `${d.descricao} (${d.local})` : d.descricao;
}
