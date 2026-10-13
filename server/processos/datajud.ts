import { digitos, type Movimentacao } from "../../lib/processos.ts";

/**
 * Chave pública da API do DataJud, divulgada pelo CNJ para qualquer pessoa
 * (https://datajud-wiki.cnj.jus.br/api-publica/acesso). O CNJ pode trocá-la: nesse caso,
 * defina DATAJUD_API_KEY com a nova, sem mudar o código.
 */
export const CHAVE_PUBLICA_DATAJUD = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";

/** UFs na ordem do código TR da Justiça Estadual e Eleitoral (Resolução CNJ 65/2008). */
const UFS = ["ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma", "mt", "ms", "mg", "pa", "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "se", "sp", "to"];

/**
 * Índice do DataJud do tribunal do processo, tirado do próprio número CNJ (segmento J.TR).
 * Devolve undefined para o que o DataJud não cobre (STF, CNJ).
 */
export function indiceDataJud(numero: string): string | undefined {
  const d = digitos(numero);
  if (d.length !== 20) return undefined;
  const j = d[13];
  const tr = Number(d.slice(14, 16));
  const uf = UFS[tr - 1];
  switch (j) {
    case "3":
      return "stj";
    case "4":
      return tr >= 1 && tr <= 6 ? `trf${tr}` : undefined;
    case "5":
      return tr === 0 ? "tst" : tr <= 24 ? `trt${tr}` : undefined;
    case "6":
      return tr === 0 ? "tse" : uf && `tre-${uf}`;
    case "7":
      return "stm";
    case "8":
      return uf && (uf === "df" ? "tjdft" : `tj${uf}`);
    case "9":
      return ({ 13: "tjmmg", 21: "tjmrs", 26: "tjmsp" } as Record<number, string>)[tr];
    default:
      return undefined;
  }
}

/** Sigla do tribunal para mostrar na tela (TJSP, TRT2, TRE-SP…). */
export const siglaDoIndice = (indice: string) => indice.toUpperCase();

export interface ResultadoDataJud {
  encontrado: boolean;
  atualizadoNoTribunal?: string;
  movimentos: Movimentacao[];
}

export type ConsultarDataJud = (numero: string) => Promise<ResultadoDataJud>;

/** Andamentos guardados por processo (os mais recentes). */
export const MAXIMO_MOVIMENTOS = 500;

/** O DataJud manda datas em ISO ou, em alguns tribunais, como "20230510142300" (hora de Brasília). */
export function lerDataJud(v: unknown): string | undefined {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const s = String(v).trim();
  const compacta = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
  const t = compacta ? Date.parse(`${compacta[1]}-${compacta[2]}-${compacta[3]}T${compacta[4]}:${compacta[5]}:${compacta[6]}-03:00`) : Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : undefined);

function complementos(lista: unknown): string[] | undefined {
  if (!Array.isArray(lista)) return undefined;
  const r = lista.flatMap((c) => {
    const { descricao, nome } = (c ?? {}) as { descricao?: unknown; nome?: unknown };
    const rotulo = texto(descricao)?.replace(/_/g, " ");
    const valor = texto(nome);
    return valor ? [rotulo ? `${rotulo}: ${valor}` : valor] : [];
  });
  return r.length ? r.slice(0, 10) : undefined;
}

/**
 * Junta os registros do processo (o DataJud pode ter um por grau: G1, G2, JE…) numa lista só,
 * sem repetidos, da mais nova para a mais antiga.
 */
export function lerResposta(corpo: unknown): ResultadoDataJud {
  const hits = ((corpo as { hits?: { hits?: unknown } })?.hits?.hits ?? []) as { _source?: Record<string, unknown> }[];
  if (!Array.isArray(hits) || !hits.length) return { encontrado: false, movimentos: [] };
  const vistos = new Set<string>();
  const movimentos: Movimentacao[] = [];
  let atualizado: string | undefined;
  const varios = new Set(hits.map((h) => h._source?.grau)).size > 1;
  for (const { _source: s } of hits) {
    if (!s) continue;
    const ultima = lerDataJud(s.dataHoraUltimaAtualizacao);
    if (ultima && (!atualizado || ultima > atualizado)) atualizado = ultima;
    const grau = varios ? texto(s.grau) : undefined;
    for (const m of Array.isArray(s.movimentos) ? (s.movimentos as Record<string, unknown>[]) : []) {
      const dataHora = lerDataJud(m?.dataHora);
      const nome = texto(m?.nome);
      if (!dataHora || !nome) continue;
      const codigo = Number.isInteger(m.codigo) ? (m.codigo as number) : undefined;
      const chave = `${dataHora}|${codigo}|${nome}|${grau}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const orgao = texto((m.orgaoJulgador as { nomeOrgao?: unknown } | undefined)?.nomeOrgao);
      const mov: Movimentacao = { dataHora, nome };
      const extras = { codigo, complementos: complementos(m.complementosTabelados), grau, orgao };
      for (const [k, v] of Object.entries(extras)) if (v !== undefined) Object.assign(mov, { [k]: v });
      movimentos.push(mov);
    }
  }
  movimentos.sort((a, b) => b.dataHora.localeCompare(a.dataHora));
  return { encontrado: true, atualizadoNoTribunal: atualizado, movimentos: movimentos.slice(0, MAXIMO_MOVIMENTOS) };
}

/** Consulta pública do DataJud (CNJ): dados e andamentos do processo, sem login. */
export function criarConsultaDataJud(op: { base: string; chave: string; timeoutMs?: number; fetch?: typeof fetch }): ConsultarDataJud {
  const fazer = op.fetch ?? fetch;
  return async (numero) => {
    const indice = indiceDataJud(numero);
    if (!indice) throw new Error("O DataJud não tem processos deste tribunal.");
    let r: Response;
    try {
      r = await fazer(`${op.base.replace(/\/$/, "")}/api_publica_${indice}/_search`, {
        method: "POST",
        headers: { Authorization: `APIKey ${op.chave}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ size: 10, query: { match: { numeroProcesso: digitos(numero) } } }),
        signal: AbortSignal.timeout(op.timeoutMs ?? 30_000),
      });
    } catch (e) {
      const tempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new Error(tempo ? "O DataJud demorou demais para responder." : "Não foi possível falar com o DataJud.");
    }
    if (r.status === 401 || r.status === 403) throw new Error("O DataJud recusou a chave de acesso (DATAJUD_API_KEY).");
    if (r.status === 429) throw new Error("O DataJud pediu para esperar antes de novas consultas.");
    if (!r.ok) throw new Error(`O DataJud respondeu com erro (${r.status}).`);
    return lerResposta(await r.json());
  };
}
