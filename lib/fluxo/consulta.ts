import { AREA_LABEL, type AreaAtuacao, diasParaPrescrever, type FaseProcesso, type Processo, referencia, TIPO_DEMANDA_LABEL } from "../processos.ts";
import { normalizar } from "../utils.ts";
import { itensDaEtapa, progresso } from "./checklist.ts";
import { ETAPAS, etapa, indiceEtapa } from "./etapas.ts";
import { fluxoEfetivo, type FluxoProcesso } from "./modelo.ts";
import type { MotorDeFluxo } from "./motor.ts";
import { diasDesde, type SituacaoPrazo, situacaoPrazo } from "./prazos.ts";

/** Um caso já com tudo o que a grade, os filtros e a ficha precisam calculado uma vez. */
export interface LinhaCaso {
  processo: Processo;
  fluxo: FluxoProcesso;
  referencia: string;
  diasNaEtapa: number;
  prazo: SituacaoPrazo;
  diasPrescricao?: number;
  checklist: { feitos: number; total: number };
  /** Pode avançar agora (sem bloqueios no motor); `undefined` na última etapa. */
  pronto?: boolean;
  bloqueios: number;
  /** Texto normalizado para a busca livre. */
  texto: string;
}

export function montarLinhas(processos: Processo[], fluxos: Record<string, FluxoProcesso>, motor: MotorDeFluxo, agora: Date, hoje: string): LinhaCaso[] {
  return processos.map((p) => {
    const fluxo = fluxoEfetivo(p, fluxos[p.id]);
    const dias = diasDesde(fluxo.etapaDesde, agora);
    const avanco = motor.avaliarAvanco(p, fluxo, hoje);
    return {
      processo: p,
      fluxo,
      referencia: referencia(p),
      diasNaEtapa: dias,
      prazo: situacaoPrazo(p.fase, dias),
      diasPrescricao: diasParaPrescrever(p.prescricao, hoje),
      checklist: progresso(itensDaEtapa(p, fluxo)),
      pronto: avanco?.permitido,
      bloqueios: avanco?.bloqueios.length ?? 0,
      texto: normalizar([p.cliente, p.parteContraria, p.numero, p.classe, p.comarca, p.orgao, p.tribunal].filter(Boolean).join(" ")),
    };
  });
}

/* ---------- Linguagem de busca: "etapa:triagem resp:ana prescreve:<30 maria" ---------- */

export type Filtro =
  | { tipo: "etapa"; valor: FaseProcesso; negado: boolean }
  | { tipo: "area"; valor: AreaAtuacao; negado: boolean }
  | { tipo: "tipo"; valor: string; negado: boolean }
  | { tipo: "resp"; valor: string; negado: boolean }
  | { tipo: "prescreve"; dias: number; negado: boolean }
  | { tipo: "prazo"; valor: "estourado" | "atencao"; negado: boolean }
  | { tipo: "estado"; valor: "pronto" | "bloqueado"; negado: boolean };

export interface Consulta {
  filtros: Filtro[];
  termos: string[];
  /** Pedaços que pareciam filtro mas não foram entendidos; a tela avisa. */
  invalidos: string[];
}

const ALIAS_ETAPA: Record<string, FaseProcesso> = Object.fromEntries(
  ETAPAS.flatMap((e) => [
    [e.id, e.id],
    [normalizar(e.sigla), e.id],
    [normalizar(e.rotulo.split(" ")[0]), e.id],
  ]),
);

const ALIAS_AREA: Record<string, AreaAtuacao> = Object.fromEntries(
  (Object.keys(AREA_LABEL) as AreaAtuacao[]).flatMap((a) => [
    [a, a],
    [normalizar(AREA_LABEL[a].split(" ")[0]), a],
  ]),
);

/** Aceita o começo da palavra ("trab", "ela") quando só um valor combina. */
function porPrefixo<T>(mapa: Record<string, T>, valor: string): T | undefined {
  if (mapa[valor]) return mapa[valor];
  const achados = new Set(Object.entries(mapa).filter(([k]) => k.startsWith(valor)).map(([, v]) => v));
  return achados.size === 1 ? [...achados][0] : undefined;
}

/** Divide respeitando aspas: resp:"ana lima". */
function pedacos(texto: string): string[] {
  return [...texto.matchAll(/-?[\p{L}\p{N}_.]+:"[^"]*"|"[^"]*"|\S+/gu)].map((m) => m[0]);
}

export function lerConsulta(texto: string): Consulta {
  const c: Consulta = { filtros: [], termos: [], invalidos: [] };
  for (const bruto of pedacos(texto)) {
    const m = /^(-?)([\p{L}]+):(.*)$/u.exec(bruto);
    if (!m) {
      const t = normalizar(bruto.replace(/"/g, ""));
      if (t) c.termos.push(t);
      continue;
    }
    const negado = m[1] === "-";
    const chave = normalizar(m[2]);
    const valor = normalizar(m[3].replace(/"/g, "").trim());
    const f = filtro(chave, valor, negado);
    if (f) c.filtros.push(f);
    else c.invalidos.push(bruto);
  }
  return c;
}

function filtro(chave: string, valor: string, negado: boolean): Filtro | undefined {
  if (!valor) return undefined;
  switch (chave) {
    case "etapa":
    case "fase":
      return porPrefixo(ALIAS_ETAPA, valor) ? { tipo: "etapa", valor: porPrefixo(ALIAS_ETAPA, valor)!, negado } : undefined;
    case "area":
      return porPrefixo(ALIAS_AREA, valor) ? { tipo: "area", valor: porPrefixo(ALIAS_AREA, valor)!, negado } : undefined;
    case "tipo":
      return (Object.keys(TIPO_DEMANDA_LABEL) as string[]).includes(valor) ? { tipo: "tipo", valor, negado } : undefined;
    case "resp":
    case "responsavel":
      return { tipo: "resp", valor, negado };
    case "prescreve": {
      const n = /^<?=?(\d{1,4})$/.exec(valor);
      return n ? { tipo: "prescreve", dias: Number(n[1]), negado } : undefined;
    }
    case "prazo":
    case "sla":
      return valor === "estourado" || valor === "atencao" ? { tipo: "prazo", valor, negado } : undefined;
    case "estado":
    case "esta":
      return valor === "pronto" || valor === "bloqueado" ? { tipo: "estado", valor, negado } : undefined;
    default:
      return undefined;
  }
}

/** Texto de volta, para a URL e para as visões salvas. */
export function escreverFiltro(f: Filtro): string {
  const v = (() => {
    switch (f.tipo) {
      case "prescreve":
        return `<${f.dias}`;
      case "resp":
        return /\s/.test(f.valor) ? `"${f.valor}"` : f.valor;
      default:
        return f.valor;
    }
  })();
  return `${f.negado ? "-" : ""}${f.tipo}:${v}`;
}

export function rotuloFiltro(f: Filtro, nomeDe: (id: string) => string | undefined): string {
  const nao = f.negado ? "não " : "";
  switch (f.tipo) {
    case "etapa":
      return `${f.negado ? "fora de" : "em"} ${etapa(f.valor).rotulo}`;
    case "area":
      return `${nao}${AREA_LABEL[f.valor]}`;
    case "tipo":
      return `${nao}${TIPO_DEMANDA_LABEL[f.valor as keyof typeof TIPO_DEMANDA_LABEL]}`;
    case "resp":
      return f.valor === "nenhum" ? (f.negado ? "com responsável" : "sem responsável") : `${f.negado ? "não é de" : "de"} ${nomeDe(f.valor) ?? f.valor}`;
    case "prescreve":
      return `${nao}prescreve em até ${f.dias} dias`;
    case "prazo":
      return `${nao}prazo da etapa ${f.valor === "estourado" ? "estourado" : "em atenção"}`;
    case "estado":
      return `${nao}${f.valor === "pronto" ? "pronto para avançar" : "bloqueado"}`;
  }
}

/** `pessoas` resolve "resp:ana" pelo começo do nome. */
export function aplicar(linhas: LinhaCaso[], c: Consulta, pessoas: { id: string; nome: string }[]): LinhaCaso[] {
  const testa = (l: LinhaCaso, f: Filtro): boolean => {
    const p = l.processo;
    switch (f.tipo) {
      case "etapa":
        return p.fase === f.valor;
      case "area":
        return p.area === f.valor;
      case "tipo":
        return p.tipo === f.valor;
      case "resp": {
        if (f.valor === "nenhum") return !p.responsavelId;
        const pessoa = pessoas.find((x) => x.id === p.responsavelId);
        return Boolean(pessoa && (pessoa.id === f.valor || normalizar(pessoa.nome).split(" ").some((parte) => parte.startsWith(f.valor)) || normalizar(pessoa.nome).startsWith(f.valor)));
      }
      case "prescreve":
        return l.diasPrescricao !== undefined && l.diasPrescricao <= f.dias;
      case "prazo":
        return f.valor === "estourado" ? l.prazo === "estourado" : l.prazo === "atencao" || l.prazo === "estourado";
      case "estado":
        return f.valor === "pronto" ? l.pronto === true : l.pronto === false;
    }
  };
  return linhas.filter((l) => c.filtros.every((f) => testa(l, f) !== f.negado) && c.termos.every((t) => l.texto.includes(t)));
}

/* ---------- Ordenação e agrupamento ---------- */

export type Coluna = "caso" | "etapa" | "checklist" | "naEtapa" | "prescricao" | "area" | "responsavel";
export interface Ordem {
  coluna: Coluna;
  direcao: "asc" | "desc";
}

/** Sem valor vai sempre para o fim, nos dois sentidos. */
export function ordenar(linhas: LinhaCaso[], o: Ordem, nomeDe: (id: string) => string | undefined): LinhaCaso[] {
  const chave = (l: LinhaCaso): string | number | undefined => {
    switch (o.coluna) {
      case "caso":
        return normalizar(l.referencia);
      case "etapa":
        return indiceEtapa(l.processo.fase);
      case "checklist":
        return l.checklist.total ? l.checklist.feitos / l.checklist.total : undefined;
      case "naEtapa":
        return l.diasNaEtapa;
      case "prescricao":
        return l.diasPrescricao;
      case "area":
        return l.processo.area ? AREA_LABEL[l.processo.area] : undefined;
      case "responsavel":
        return l.processo.responsavelId ? normalizar(nomeDe(l.processo.responsavelId) ?? "") : undefined;
    }
  };
  const s = o.direcao === "asc" ? 1 : -1;
  return [...linhas].sort((a, b) => {
    const x = chave(a);
    const y = chave(b);
    if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1;
    const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR");
    return r * s || a.referencia.localeCompare(b.referencia, "pt-BR");
  });
}

export type Agrupamento = "etapa" | "responsavel" | "area" | "nenhum";

export interface Grupo {
  chave: string;
  rotulo: string;
  linhas: LinhaCaso[];
}

export function agrupar(linhas: LinhaCaso[], por: Agrupamento, nomeDe: (id: string) => string | undefined): Grupo[] {
  if (por === "nenhum") return [{ chave: "todos", rotulo: "Todos", linhas }];
  if (por === "etapa") return ETAPAS.map((e) => ({ chave: e.id, rotulo: e.rotulo, linhas: linhas.filter((l) => l.processo.fase === e.id) })).filter((g) => g.linhas.length);
  const mapa = new Map<string, Grupo>();
  for (const l of linhas) {
    const id = por === "area" ? l.processo.area : l.processo.responsavelId;
    const chave = id ?? "_sem";
    const rotulo = !id ? (por === "area" ? "Sem área" : "Sem responsável") : por === "area" ? AREA_LABEL[id as AreaAtuacao] : (nomeDe(id) ?? "Pessoa removida");
    if (!mapa.has(chave)) mapa.set(chave, { chave, rotulo, linhas: [] });
    mapa.get(chave)!.linhas.push(l);
  }
  return [...mapa.values()].sort((a, b) => (a.chave === "_sem" ? 1 : b.chave === "_sem" ? -1 : a.rotulo.localeCompare(b.rotulo, "pt-BR")));
}

/* ---------- Visões prontas ---------- */

export interface Visao {
  id: string;
  rotulo: string;
  consulta: string;
  tom?: "vermelho" | "ambar" | "verde" | "neutro" | "vazio";
}

export const VISOES_PADRAO: readonly Visao[] = [
  { id: "todos", rotulo: "Todos os casos", consulta: "" },
  { id: "andamento", rotulo: "Em andamento", consulta: "-etapa:protocolado" },
  { id: "estourado", rotulo: "Prazo da etapa estourado", consulta: "-etapa:protocolado prazo:estourado", tom: "vermelho" },
  { id: "prescricao", rotulo: "Prescreve em 30 dias", consulta: "-etapa:protocolado prescreve:<30", tom: "ambar" },
  { id: "bloqueados", rotulo: "Bloqueados para avançar", consulta: "-etapa:protocolado estado:bloqueado", tom: "neutro" },
  { id: "prontos", rotulo: "Prontos para avançar", consulta: "estado:pronto", tom: "verde" },
  { id: "sem-resp", rotulo: "Sem responsável", consulta: "-etapa:protocolado resp:nenhum", tom: "vazio" },
];

/** Números da esteira: quantos casos, média de dias e estourados por etapa. */
export function resumoDaEsteira(linhas: LinhaCaso[]) {
  return ETAPAS.map((e) => {
    const da = linhas.filter((l) => l.processo.fase === e.id);
    const media = da.length ? da.reduce((s, l) => s + l.diasNaEtapa, 0) / da.length : 0;
    return { etapa: e, total: da.length, mediaDias: media, estourados: da.filter((l) => l.prazo === "estourado").length, prontos: da.filter((l) => l.pronto).length };
  });
}
