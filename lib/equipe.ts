import { diasUteisAte } from "./avisos.ts";
import { calendarioDa } from "./prazos/calculo.ts";
import type { Intimacao, PessoaEquipe, Suspensao } from "./types.ts";

/** Quantos dias úteis à frente contam como "vence logo" no painel. */
export const DIAS_URGENTE = 3;

export interface LinhaPainel {
  /** `null` é a linha das intimações sem responsável. */
  pessoa: PessoaEquipe | null;
  abertas: number;
  vencidas: number;
  /** Vencem hoje ou nos próximos DIAS_URGENTE dias úteis. */
  urgentes: number;
  semPrazo: number;
  /** As próximas a vencer, em ordem de prazo. */
  proximas: Intimacao[];
}

const emAberto = (i: Intimacao) => i.status === "nova" || i.status === "em_analise";

/**
 * Carga de cada pessoa da equipe: o que está em aberto, vencido e para vencer logo.
 * Quem está inativo só aparece se ainda tiver intimação em aberto.
 */
export function painelPorPessoa(intimacoes: Intimacao[], equipe: PessoaEquipe[], hoje: string, suspensoes: Suspensao[], quantasProximas = 5): LinhaPainel[] {
  const ids = new Set(equipe.map((p) => p.id));
  const grupos = new Map<string | null, Intimacao[]>();
  for (const i of intimacoes) {
    if (!emAberto(i)) continue;
    // Responsável apagado da equipe conta como sem responsável.
    const chave = i.responsavelId && ids.has(i.responsavelId) ? i.responsavelId : null;
    grupos.set(chave, [...(grupos.get(chave) ?? []), i]);
  }

  const linha = (pessoa: PessoaEquipe | null): LinhaPainel => {
    const lista = grupos.get(pessoa?.id ?? null) ?? [];
    let vencidas = 0;
    let urgentes = 0;
    let semPrazo = 0;
    for (const i of lista) {
      if (!i.prazo) semPrazo++;
      else if (i.prazo < hoje) vencidas++;
      else if (diasUteisAte(hoje, i.prazo, calendarioDa(i, suspensoes)) <= DIAS_URGENTE) urgentes++;
    }
    const proximas = lista.filter((i) => i.prazo).sort((a, b) => a.prazo!.localeCompare(b.prazo!)).slice(0, quantasProximas);
    return { pessoa, abertas: lista.length, vencidas, urgentes, semPrazo, proximas };
  };

  const linhas = equipe.filter((p) => !p.inativa || grupos.has(p.id)).map(linha);
  linhas.sort((a, b) => b.vencidas - a.vencidas || b.urgentes - a.urgentes || b.abertas - a.abertas || a.pessoa!.nome.localeCompare(b.pessoa!.nome, "pt-BR"));
  return [...linhas, linha(null)];
}

/** Entrega (ou tira, com `null`) as intimações indicadas a uma pessoa. */
export function delegar(intimacoes: Intimacao[], ids: Iterable<string>, pessoaId: string | null, agora: string): Intimacao[] {
  const alvo = new Set(ids);
  return intimacoes.map((i) => {
    if (!alvo.has(i.id) || (i.responsavelId ?? null) === pessoaId) return i;
    const { responsavelId: _r, delegadaEm: _d, ...resto } = i;
    return pessoaId ? { ...resto, responsavelId: pessoaId, delegadaEm: agora, updatedAt: agora } : { ...resto, updatedAt: agora };
  });
}

/** Iniciais para o selo do responsável ("Ana Souza" → "AS"). */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter((p) => !/^(d[aeo]s?|e)$/i.test(p));
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}
