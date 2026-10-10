/**
 * Integração com a API pública do Comunica PJe (Diário de Justiça Eletrônico Nacional).
 * Endpoint: GET https://comunicaapi.pje.jus.br/api/v1/comunicacao
 *
 * Este módulo só contém funções puras (montagem de parâmetros e normalização da resposta)
 * para poder ser usado tanto no route handler quanto nos testes.
 */
import type { Advogado, Intimacao, Parte, TermoMonitorado } from "./types";

export const COMUNICA_API_URL = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
export const COMUNICA_ITENS_POR_PAGINA = 100;

export interface ConsultaComunica {
  termo: Pick<TermoMonitorado, "tipo" | "valor" | "ufOab" | "tribunal">;
  dataInicio: string;
  dataFim: string;
  pagina?: number;
}

/** Monta os parâmetros de consulta aceitos pela API do Comunica. */
export function montarParametros(c: ConsultaComunica): URLSearchParams {
  const p = new URLSearchParams();
  const valor = c.termo.valor.trim();
  switch (c.termo.tipo) {
    case "parte":
      p.set("nomeParte", valor);
      break;
    case "advogado":
      p.set("nomeAdvogado", valor);
      break;
    case "oab":
      p.set("numeroOab", valor.replace(/\D/g, ""));
      if (c.termo.ufOab) p.set("ufOab", c.termo.ufOab.toUpperCase());
      break;
    case "processo":
      p.set("numeroProcesso", valor.replace(/\D/g, ""));
      break;
  }
  if (c.termo.tribunal) p.set("siglaTribunal", c.termo.tribunal.trim().toUpperCase());
  if (c.dataInicio) p.set("dataDisponibilizacaoInicio", c.dataInicio);
  if (c.dataFim) p.set("dataDisponibilizacaoFim", c.dataFim);
  p.set("pagina", String(c.pagina ?? 1));
  p.set("itensPorPagina", String(COMUNICA_ITENS_POR_PAGINA));
  return p;
}

/** Valida uma consulta antes de enviá-la. Retorna uma mensagem de erro ou null. */
export function validarConsulta(c: ConsultaComunica): string | null {
  if (!c.termo.valor || !c.termo.valor.trim()) return "Informe o valor a pesquisar.";
  if (c.termo.tipo === "oab") {
    if (!/^\d{1,7}$/.test(c.termo.valor.replace(/\D/g, ""))) return "Número de OAB inválido.";
    if (!c.termo.ufOab) return "Informe a UF da OAB.";
  }
  if (c.termo.tipo === "processo" && c.termo.valor.replace(/\D/g, "").length !== 20) {
    return "O número do processo deve ter 20 dígitos (padrão CNJ).";
  }
  if (c.termo.tipo === "parte" && c.termo.valor.trim().length < 3) {
    return "O nome da parte deve ter ao menos 3 caracteres.";
  }
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(c.dataInicio) || !re.test(c.dataFim)) return "Período inválido.";
  if (c.dataInicio > c.dataFim) return "A data inicial deve ser anterior à final.";
  return null;
}

type Bruto = Record<string, unknown>;

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function primeiro(obj: Bruto, ...chaves: string[]): string {
  for (const k of chaves) {
    const v = str(obj[k]);
    if (v) return v;
  }
  return "";
}

function dataISO(v: string): string {
  if (!v) return "";
  // Aceita "2024-05-10", "2024-05-10T00:00:00" e "10/05/2024".
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  if (iso) return iso[1];
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return v;
}

export type IntimacaoImportada = Omit<Intimacao, "id" | "status" | "createdAt" | "updatedAt" | "cliente">;

/** Converte um item retornado pela API do Comunica para o modelo da aplicação. */
export function normalizarItem(item: Bruto): IntimacaoImportada {
  const destinatarios = Array.isArray(item.destinatarios) ? (item.destinatarios as Bruto[]) : [];
  const advs = Array.isArray(item.destinatarioadvogados) ? (item.destinatarioadvogados as Bruto[]) : [];

  const partes: Parte[] = destinatarios
    .map((d) => ({ nome: str(d.nome), polo: str(d.polo) }))
    .filter((p) => p.nome);

  const advogados: Advogado[] = advs
    .map((a) => {
      const adv = (a.advogado && typeof a.advogado === "object" ? a.advogado : a) as Bruto;
      return { nome: str(adv.nome), oab: str(adv.numero_oab), uf: str(adv.uf_oab) };
    })
    .filter((a) => a.nome);

  const comunicaId = primeiro(item, "id", "numeroComunicacao");
  return {
    origem: "comunica",
    comunicaId,
    hash: primeiro(item, "hash") || undefined,
    tribunal: primeiro(item, "siglaTribunal", "sigla_tribunal"),
    orgao: primeiro(item, "nomeOrgao", "nome_orgao"),
    dataDisponibilizacao: dataISO(primeiro(item, "data_disponibilizacao", "datadisponibilizacao", "dataDisponibilizacao")),
    tipoComunicacao: primeiro(item, "tipoComunicacao", "tipo_comunicacao") || "Intimação",
    meio: primeiro(item, "meio"),
    tipoDocumento: primeiro(item, "tipoDocumento", "tipo_documento"),
    classe: primeiro(item, "nomeClasse", "nome_classe"),
    numeroProcesso: primeiro(item, "numeroprocessocommascara", "numero_processo", "numeroProcesso"),
    partes,
    advogados,
    texto: primeiro(item, "texto"),
    link: primeiro(item, "link") || undefined,
  };
}

export interface RespostaComunica {
  total: number;
  itens: IntimacaoImportada[];
}

/** Interpreta o corpo JSON retornado pela API do Comunica. */
export function interpretarResposta(json: unknown): RespostaComunica {
  const corpo = (json ?? {}) as Bruto;
  const lista = Array.isArray(corpo.items) ? corpo.items : Array.isArray(json) ? (json as unknown[]) : [];
  const itens = (lista as Bruto[]).map(normalizarItem);
  const total = Number(corpo.count ?? itens.length) || itens.length;
  return { total, itens };
}

/** Chave usada para evitar importar a mesma comunicação duas vezes. */
export function chaveDeduplicacao(i: Pick<Intimacao, "comunicaId" | "hash" | "numeroProcesso" | "dataDisponibilizacao" | "texto">): string {
  if (i.hash) return `h:${i.hash}`;
  if (i.comunicaId) return `c:${i.comunicaId}`;
  return `t:${i.numeroProcesso}|${i.dataDisponibilizacao}|${(i.texto ?? "").slice(0, 80)}`;
}

/**
 * Divide um período em janelas de no máximo `dias` dias, da mais recente para a mais antiga.
 * Consultas por nome de grandes litigantes ficam lentas no Comunica quando o período é longo;
 * janelas curtas respondem bem mais rápido.
 */
export function dividirPeriodo(inicio: string, fim: string, dias: number): { inicio: string; fim: string }[] {
  const DIA = 86_400_000;
  const ini = Date.parse(`${inicio}T00:00:00Z`);
  let f = Date.parse(`${fim}T00:00:00Z`);
  const janelas: { inicio: string; fim: string }[] = [];
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  while (f >= ini) {
    const i = Math.max(ini, f - (dias - 1) * DIA);
    janelas.push({ inicio: iso(i), fim: iso(f) });
    f = i - DIA;
  }
  return janelas;
}
