import { TIPO_ITEM_LABEL, type TipoItemBiblioteca } from "../../lib/biblioteca.ts";
import { LIMITES_PARECER, NIVEL_RISCO_LABEL, type Processo } from "../../lib/processos.ts";
import { AppError } from "../core/errors.ts";
import type { BibliotecaService } from "../biblioteca/biblioteca.ts";
import type { AnalisesService } from "./analises.ts";
import { LIMITES_ANALISE } from "./analises.ts";
import type { DocumentosService } from "./documentos.ts";
import type { PareceresService } from "./pareceres.ts";
import type { ProcessoRepository } from "./processos.ts";

/** Item da biblioteca como a IA recebe: o PDF ou o texto, com o que identifica o item. */
export interface FonteDaBiblioteca {
  tipo: TipoItemBiblioteca;
  titulo: string;
  referencia?: string;
  tribunal?: string;
  pdf?: Uint8Array;
  texto?: string;
}

export interface EntradaRedacao {
  processo: Processo;
  documentos: { nome: string; bytes: Uint8Array }[];
  biblioteca: FonteDaBiblioteca[];
  parecerAtual?: string;
  risco?: { nivel: string; justificativa: string };
  orientacao?: string;
  /** Padrões do escritório para o parecer (texto já montado). */
  padroes?: string;
}

/** Redige o rascunho do parecer. Sem implementação configurada, o botão fica desligado. */
export interface RedatorParecer {
  readonly modelo: string;
  redigir(entrada: EntradaRedacao): Promise<string>;
}

export const LIMITES_REDACAO = {
  itens: 8,
  orientacao: 2000,
  /** Texto somado dos itens da biblioteca enviados como texto. */
  caracteresBiblioteca: 300_000,
  porDia: 20,
} as const;

export function rotuloFonte(f: Pick<FonteDaBiblioteca, "tipo" | "titulo" | "referencia" | "tribunal">): string {
  const extra = [f.referencia, f.tribunal].filter(Boolean).join(" · ");
  return `${TIPO_ITEM_LABEL[f.tipo]}: ${f.titulo}${extra ? ` (${extra})` : ""}`;
}

/** Limpa a resposta da IA: sem cercas de código, sem espaços sobrando e dentro do limite do parecer. */
export function normalizarRascunho(texto: string): string {
  const t = texto
    .replace(/^\s*```[a-z]*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t.length > LIMITES_PARECER.caracteres ? `${t.slice(0, LIMITES_PARECER.caracteres - 1).trimEnd()}…` : t;
}

const idValido = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id);

/**
 * Rascunho do parecer pela IA, com base nos PDFs do processo e nos itens da biblioteca que o
 * advogado escolheu. Nada é gravado aqui: o texto vai para o editor e só vira versão se ele salvar.
 */
export class RedacaoParecerService {
  private readonly processos: ProcessoRepository;
  private readonly documentos: DocumentosService;
  private readonly biblioteca: BibliotecaService;
  private readonly pareceres: PareceresService;
  private readonly analises: AnalisesService;
  private readonly redator?: RedatorParecer;
  private readonly limitar: (usuarioId: string) => void;
  private readonly padroes: (usuarioId: string) => Promise<string>;
  private readonly emAndamento = new Set<string>();

  constructor(d: {
    processos: ProcessoRepository;
    documentos: DocumentosService;
    biblioteca: BibliotecaService;
    pareceres: PareceresService;
    analises: AnalisesService;
    redator?: RedatorParecer;
    limitar?: (usuarioId: string) => void;
    padroes?: (usuarioId: string) => Promise<string>;
  }) {
    this.processos = d.processos;
    this.documentos = d.documentos;
    this.biblioteca = d.biblioteca;
    this.padroes = d.padroes ?? (async () => "");
    this.pareceres = d.pareceres;
    this.analises = d.analises;
    this.redator = d.redator;
    this.limitar = d.limitar ?? (() => undefined);
  }

  get disponivel(): boolean {
    return !!this.redator;
  }

  async redigir(usuarioId: string, processoId: string, corpo: unknown): Promise<{ texto: string; fontes: string[]; documentos: string[]; modelo: string }> {
    const redator = this.redator;
    if (!redator) throw new AppError("indisponivel", "A redação pela IA não está ligada neste servidor.");
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as { itens?: unknown; orientacao?: unknown };
    const ids = Array.isArray(c.itens) ? [...new Set(c.itens.filter(idValido))] : [];
    if (ids.length > LIMITES_REDACAO.itens) throw new AppError("dados_invalidos", `Escolha no máximo ${LIMITES_REDACAO.itens} itens da biblioteca.`);
    const orientacao = typeof c.orientacao === "string" ? c.orientacao.trim() : "";
    if (orientacao.length > LIMITES_REDACAO.orientacao) throw new AppError("dados_invalidos", `A orientação passa de ${LIMITES_REDACAO.orientacao} caracteres.`);

    const processo = idValido(processoId) ? await this.processos.porId(usuarioId, processoId) : null;
    if (!processo) throw new AppError("nao_encontrado", "Processo não encontrado.");

    // Itens da biblioteca primeiro (foram escolhidos a dedo); o que sobrar do limite vai para os PDFs do processo.
    let bytes = 0;
    let caracteres = 0;
    const biblioteca: FonteDaBiblioteca[] = [];
    for (const { item, pdf, texto } of await this.biblioteca.paraIa(usuarioId, ids)) {
      const base = { tipo: item.tipo, titulo: item.titulo, referencia: item.referencia, tribunal: item.tribunal };
      if (pdf && bytes + pdf.length <= LIMITES_ANALISE.bytes) {
        bytes += pdf.length;
        biblioteca.push({ ...base, pdf, ...(texto ? { texto: texto.slice(0, 20_000) } : {}) });
      } else if (texto && caracteres + texto.length <= LIMITES_REDACAO.caracteresBiblioteca) {
        caracteres += texto.length;
        biblioteca.push({ ...base, texto });
      }
    }
    if (ids.length && !biblioteca.length) throw new AppError("dados_invalidos", "Os itens escolhidos não têm conteúdo que a IA consiga ler, ou são grandes demais juntos.");

    const escolhidos: { id: string; nome: string }[] = [];
    for (const d of await this.documentos.listar(usuarioId, processoId)) {
      if (escolhidos.length >= LIMITES_ANALISE.documentos) break;
      if (bytes + d.tamanho > LIMITES_ANALISE.bytes) continue;
      escolhidos.push(d);
      bytes += d.tamanho;
    }
    if (!escolhidos.length && !biblioteca.length) {
      throw new AppError("dados_invalidos", "Anexe ao menos um PDF ao processo ou escolha itens da biblioteca para a IA usar como base.");
    }

    if (this.emAndamento.has(processoId)) throw new AppError("conflito", "Já há um rascunho deste processo sendo redigido.");
    this.limitar(usuarioId);
    this.emAndamento.add(processoId);
    try {
      const documentos = [];
      for (const d of escolhidos) documentos.push({ nome: d.nome, bytes: (await this.documentos.abrir(usuarioId, processoId, d.id)).bytes });
      const [parecer] = await this.pareceres.listar(usuarioId, processoId);
      const [analise] = await this.analises.listar(usuarioId, processoId);
      const padroes = await this.padroes(usuarioId);
      let texto: string;
      try {
        texto = normalizarRascunho(
          await redator.redigir({
            processo,
            documentos,
            biblioteca,
            ...(parecer ? { parecerAtual: parecer.texto } : {}),
            ...(analise ? { risco: { nivel: NIVEL_RISCO_LABEL[analise.nivel], justificativa: analise.justificativa } } : {}),
            ...(orientacao ? { orientacao } : {}),
            ...(padroes ? { padroes } : {}),
          }),
        );
      } catch (e) {
        console.error("[parecer-ia] falha na redação:", e instanceof Error ? e.message : e);
        throw new AppError("indisponivel", "A IA não conseguiu redigir o rascunho agora. Tente de novo em alguns minutos.");
      }
      if (!texto) throw new AppError("indisponivel", "A IA devolveu um rascunho vazio. Tente de novo.");
      return { texto, fontes: biblioteca.map(rotuloFonte), documentos: escolhidos.map((d) => d.nome), modelo: redator.modelo };
    } finally {
      this.emAndamento.delete(processoId);
    }
  }
}
