import type { Advogado, Intimacao, TermoMonitorado } from "./types";

/**
 * Separação das intimações por quem atua no processo, a partir dos advogados intimados.
 * Não muda a busca no Comunica: só organiza o que já foi importado.
 */
export type Atuacao = "so_eu" | "colegas" | "conjunta";

export const ATUACOES: { valor: Atuacao; rotulo: string; selo: string; legenda: string }[] = [
  { valor: "so_eu", rotulo: "Só eu", selo: "Só eu", legenda: "você é o único advogado intimado" },
  { valor: "colegas", rotulo: "Eu e colegas do escritório", selo: "Eu e colega", legenda: "além de você, só advogados do seu escritório" },
  { valor: "conjunta", rotulo: "Atuação conjunta", selo: "Conjunta", legenda: "tem advogado de fora do escritório" },
];

/** Cores de cada grupo, iguais nas abas, no selo do card e na lista de advogados. */
export const ESTILO_ATUACAO: Record<Atuacao, { ponto: string; aba: string; selo: string; texto: string }> = {
  so_eu: { ponto: "bg-emerald-500", aba: "bg-emerald-50 text-emerald-800 ring-emerald-300", selo: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", texto: "text-emerald-700" },
  colegas: { ponto: "bg-violet-500", aba: "bg-violet-50 text-violet-800 ring-violet-300", selo: "bg-violet-50 text-violet-700 ring-violet-600/20", texto: "text-violet-700" },
  conjunta: { ponto: "bg-amber-500", aba: "bg-amber-50 text-amber-800 ring-amber-300", selo: "bg-amber-50 text-amber-800 ring-amber-600/20", texto: "text-amber-700" },
};

function norm(s: string | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Uma forma de reconhecer um advogado: OAB (número e UF) ou, sem OAB, o nome completo. */
export interface IdAdvogado {
  oab?: string;
  uf?: string;
  nome?: string;
}

function chaves(a: IdAdvogado): string[] {
  const k: string[] = [];
  const oab = (a.oab ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (oab) k.push(`oab:${oab}/${(a.uf ?? "").trim().toUpperCase()}`);
  if (norm(a.nome)) k.push(`nome:${norm(a.nome)}`);
  return k;
}

/** Quem é "eu" e quem é colega do escritório, montado a partir dos clientes monitorados. */
export interface ReferenciaAtuacao {
  eu: Set<string>;
  colegas: Set<string>;
}

/** Advogado de um cliente por OAB ou por nome do advogado. */
function advogadoDoTermo(t: TermoMonitorado): IdAdvogado | null {
  if (t.tipo === "oab") return { oab: t.valor, uf: t.ufOab };
  if (t.tipo === "advogado") return { nome: t.valor };
  return null;
}

export function referenciaAtuacao(termos: TermoMonitorado[]): ReferenciaAtuacao | null {
  const eu = new Set<string>();
  const colegas = new Set<string>();
  for (const t of termos) {
    const adv = advogadoDoTermo(t);
    if (!adv || !t.atuacao) continue;
    chaves(adv).forEach((k) => (t.atuacao!.souEu ? eu : colegas).add(k));
    for (const c of t.atuacao.colegas) chaves(c).forEach((k) => colegas.add(k));
  }
  if (!eu.size) return null;
  eu.forEach((k) => colegas.delete(k));
  return { eu, colegas };
}

/** Reconhece pela OAB quando a intimação traz OAB; o nome só vale quando a referência não tem OAB. */
function pertence(a: Advogado, conjunto: Set<string>): boolean {
  const [porOab, porNome] = [chaves({ oab: a.oab, uf: a.uf })[0], `nome:${norm(a.nome)}`];
  if (porOab) {
    if (conjunto.has(porOab)) return true;
    // A intimação às vezes vem sem UF: aceita o número quando há uma só UF cadastrada para ele.
    if (porOab.endsWith("/")) return [...conjunto].some((k) => k.startsWith(porOab));
  }
  return conjunto.has(porNome);
}

/**
 * Em qual grupo a intimação cai. `undefined` quando não há referência configurada ou quando
 * nenhum dos seus advogados ("Sou eu") aparece na intimação: ela fica só na aba Todos.
 */
export function classificarAtuacao(i: Pick<Intimacao, "advogados">, ref: ReferenciaAtuacao | null): Atuacao | undefined {
  if (!ref) return undefined;
  const advs = i.advogados ?? [];
  if (!advs.some((a) => pertence(a, ref.eu))) return undefined;
  const outros = advs.filter((a) => !pertence(a, ref.eu));
  if (!outros.length) return "so_eu";
  return outros.every((a) => pertence(a, ref.colegas)) ? "colegas" : "conjunta";
}

/** Papel de um advogado da intimação, para colorir a lista no card. */
export function papelDoAdvogado(a: Advogado, ref: ReferenciaAtuacao): Atuacao {
  if (pertence(a, ref.eu)) return "so_eu";
  return pertence(a, ref.colegas) ? "colegas" : "conjunta";
}
