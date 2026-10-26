import { AREA_LABEL, type AreaAtuacao } from "./processos.ts";
import { normalizar } from "./utils.ts";

/**
 * Biblioteca do escritório: modelos de peça, jurisprudência, súmulas, legislação e doutrina que a
 * equipe guarda para consultar e para a IA usar como base ao redigir o parecer.
 */
export const TIPO_ITEM_LABEL = {
  modelo: "Modelo de peça",
  jurisprudencia: "Jurisprudência",
  sumula: "Súmula",
  legislacao: "Legislação",
  doutrina: "Doutrina e artigos",
} as const;

export type TipoItemBiblioteca = keyof typeof TIPO_ITEM_LABEL;

export const TIPOS_ITEM = Object.keys(TIPO_ITEM_LABEL) as TipoItemBiblioteca[];

/** Formatos de arquivo aceitos: PDF (decisões, acórdãos) e Word (modelos de peça). */
export type FormatoArquivo = "pdf" | "docx";

export const TIPO_MIME: Record<FormatoArquivo, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export interface ArquivoBiblioteca {
  nome: string;
  /** Em bytes. */
  tamanho: number;
  formato: FormatoArquivo;
}

export interface ItemBiblioteca {
  id: string;
  tipo: TipoItemBiblioteca;
  titulo: string;
  /** Identificação curta: "Súmula 385/STJ", "REsp 1.234.567/SP", "Art. 186 do CC". */
  referencia?: string;
  /** Sigla do tribunal ou órgão (STJ, TJSP, TRT2…). */
  tribunal?: string;
  area?: AreaAtuacao;
  /** Ementa, enunciado, trecho ou o próprio modelo colado. */
  texto?: string;
  etiquetas: string[];
  /** Onde foi encontrado (página do tribunal, Jusbrasil…). */
  link?: string;
  arquivo?: ArquivoBiblioteca;
  autorId: string;
  autorNome: string;
  criadoEm: string;
  atualizadoEm: string;
}

/** O que a tela manda ao criar ou editar (o arquivo vai à parte, no multipart). */
export type DadosItemBiblioteca = Pick<ItemBiblioteca, "tipo" | "titulo" | "referencia" | "tribunal" | "area" | "texto" | "etiquetas" | "link">;

export type ErrosItemBiblioteca = Partial<Record<keyof DadosItemBiblioteca | "arquivo", string>>;

export const LIMITES_BIBLIOTECA = {
  titulo: 200,
  referencia: 200,
  tribunal: 40,
  texto: 50_000,
  link: 1000,
  etiquetas: 10,
  etiqueta: 40,
  bytes: 20 * 1024 * 1024,
  porEscritorio: 2000,
  /** Texto tirado de um .docx que segue para a IA. */
  textoArquivo: 200_000,
} as const;

const texto = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "");

/** Etiquetas sem repetição (ignorando acento e caixa), na ordem em que vieram. */
export function limparEtiquetas(v: unknown): string[] {
  const lista = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const e of lista) {
    const t = texto(e).replace(/\s+/g, " ").replace(/^#/, "");
    const chave = normalizar(t);
    if (!t || vistas.has(chave)) continue;
    vistas.add(chave);
    saida.push(t);
  }
  return saida;
}

export function linkValido(link: string): boolean {
  try {
    const u = new URL(link);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function validarItem(d: Partial<Record<keyof DadosItemBiblioteca, unknown>>, temArquivo: boolean): ErrosItemBiblioteca {
  const erros: ErrosItemBiblioteca = {};
  if (!TIPOS_ITEM.includes(d.tipo as TipoItemBiblioteca)) erros.tipo = "Escolha o tipo.";
  const titulo = texto(d.titulo);
  if (!titulo) erros.titulo = "Dê um título.";
  else if (titulo.length > LIMITES_BIBLIOTECA.titulo) erros.titulo = `No máximo ${LIMITES_BIBLIOTECA.titulo} caracteres.`;
  if (texto(d.referencia).length > LIMITES_BIBLIOTECA.referencia) erros.referencia = `No máximo ${LIMITES_BIBLIOTECA.referencia} caracteres.`;
  if (texto(d.tribunal).length > LIMITES_BIBLIOTECA.tribunal) erros.tribunal = `No máximo ${LIMITES_BIBLIOTECA.tribunal} caracteres.`;
  if (d.area !== undefined && d.area !== "" && !(typeof d.area === "string" && d.area in AREA_LABEL)) erros.area = "Área inválida.";
  if (texto(d.texto).length > LIMITES_BIBLIOTECA.texto) erros.texto = `No máximo ${LIMITES_BIBLIOTECA.texto.toLocaleString("pt-BR")} caracteres.`;
  const link = texto(d.link);
  if (link && (link.length > LIMITES_BIBLIOTECA.link || !linkValido(link))) erros.link = "Use um endereço que comece com https://.";
  const etiquetas = limparEtiquetas(d.etiquetas);
  if (etiquetas.length > LIMITES_BIBLIOTECA.etiquetas) erros.etiquetas = `No máximo ${LIMITES_BIBLIOTECA.etiquetas} etiquetas.`;
  else if (etiquetas.some((e) => e.length > LIMITES_BIBLIOTECA.etiqueta)) erros.etiquetas = `Cada etiqueta com no máximo ${LIMITES_BIBLIOTECA.etiqueta} caracteres.`;
  // Sem arquivo, o conteúdo precisa estar no texto: senão o item não serve para consulta nem para a IA.
  if (!temArquivo && !texto(d.texto)) erros.texto = "Cole o texto (ementa, enunciado ou o modelo) ou anexe um arquivo.";
  return erros;
}

export function normalizarItem(d: Partial<Record<keyof DadosItemBiblioteca, unknown>>): DadosItemBiblioteca {
  const opcional = (v: unknown) => texto(v) || undefined;
  return {
    tipo: d.tipo as TipoItemBiblioteca,
    titulo: texto(d.titulo),
    referencia: opcional(d.referencia),
    tribunal: opcional(d.tribunal)?.toUpperCase(),
    area: (opcional(d.area) as AreaAtuacao | undefined) ?? undefined,
    texto: opcional(d.texto),
    etiquetas: limparEtiquetas(d.etiquetas),
    link: opcional(d.link),
  };
}

/** Busca na biblioteca: todas as palavras precisam aparecer (sem acento e caixa) em algum campo. */
export function filtrarItens(itens: ItemBiblioteca[], f: { busca?: string; tipo?: TipoItemBiblioteca | ""; area?: AreaAtuacao | "" }): ItemBiblioteca[] {
  const palavras = normalizar(f.busca ?? "").split(/\s+/).filter(Boolean);
  return itens.filter((i) => {
    if (f.tipo && i.tipo !== f.tipo) return false;
    if (f.area && i.area !== f.area) return false;
    if (!palavras.length) return true;
    const alvo = normalizar([i.titulo, i.referencia, i.tribunal, i.texto, i.arquivo?.nome, ...i.etiquetas].filter(Boolean).join(" "));
    return palavras.every((p) => alvo.includes(p));
  });
}

/** Itens que mais combinam com o processo: mesma área primeiro, depois os mais novos. */
export function sugerirParaProcesso(itens: ItemBiblioteca[], area?: AreaAtuacao): ItemBiblioteca[] {
  return [...itens].sort((a, b) => {
    const pa = area && a.area === area ? 0 : 1;
    const pb = area && b.area === area ? 0 : 1;
    return pa - pb || b.atualizadoEm.localeCompare(a.atualizadoEm);
  });
}

/** Sites públicos de pesquisa. Abrem numa aba nova com a busca já digitada. */
export interface FontePesquisa {
  id: string;
  nome: string;
  descricao: string;
  url(busca: string): string;
}

const q = encodeURIComponent;
const google = (site: string, busca: string) => `https://www.google.com/search?q=${q(`site:${site} ${busca}`)}`;

export const FONTES_PESQUISA: FontePesquisa[] = [
  {
    id: "stf",
    nome: "STF",
    descricao: "Acórdãos do Supremo",
    url: (b) => `https://jurisprudencia.stf.jus.br/pages/search?base=acordaos&sinonimo=true&plural=true&page=1&pageSize=10&sort=_score&sortBy=desc&queryString=${q(b)}`,
  },
  {
    id: "stf-sumulas",
    nome: "STF · súmulas",
    descricao: "Súmulas e súmulas vinculantes",
    url: (b) => `https://jurisprudencia.stf.jus.br/pages/search?base=sumulas&sinonimo=true&plural=true&page=1&pageSize=10&sort=_score&sortBy=desc&queryString=${q(b)}`,
  },
  { id: "stj", nome: "STJ", descricao: "Acórdãos do STJ", url: (b) => `https://scon.stj.jus.br/SCON/pesquisar.jsp?b=ACOR&livre=${q(b)}` },
  { id: "stj-sumulas", nome: "STJ · súmulas", descricao: "Súmulas do STJ", url: (b) => `https://scon.stj.jus.br/SCON/pesquisar.jsp?b=SUMU&livre=${q(b)}` },
  { id: "tst", nome: "TST", descricao: "Jurisprudência trabalhista", url: (b) => google("tst.jus.br", `jurisprudência ${b}`) },
  { id: "jusbrasil", nome: "Jusbrasil", descricao: "Decisões de vários tribunais", url: (b) => `https://www.jusbrasil.com.br/jurisprudencia/busca?q=${q(b)}` },
  { id: "lexml", nome: "LexML", descricao: "Leis, normas e projetos", url: (b) => `https://www.lexml.gov.br/busca/search?keyword=${q(b)}` },
  { id: "planalto", nome: "Planalto", descricao: "Texto das leis federais", url: (b) => google("planalto.gov.br/ccivil_03", b) },
  { id: "academico", nome: "Google Acadêmico", descricao: "Doutrina e artigos", url: (b) => `https://scholar.google.com.br/scholar?hl=pt-BR&q=${q(b)}` },
];

/** Site do tribunal pela sigla (TJSP → tjsp.jus.br, TRT2 → trt2.jus.br). */
export function siteDoTribunal(sigla: string): string | undefined {
  const s = sigla.trim().toLowerCase();
  return /^(tj[a-z]{2,3}|trt\d{1,2}|trf\d|tre-[a-z]{2})$/.test(s) ? `${s}.jus.br` : undefined;
}

/** Pesquisa de jurisprudência dentro do site de um tribunal estadual ou regional. */
export function pesquisaNoTribunal(sigla: string, busca: string): string | undefined {
  const site = siteDoTribunal(sigla);
  return site ? google(site, `jurisprudência ${busca}`) : undefined;
}
