import type { Intimacao } from "./types.ts";

/** De que lado o cliente do escritório está no processo. */
export type PoloCliente = "ativo" | "passivo";

export const POLO_CLIENTE_LABEL: Record<PoloCliente, string> = {
  ativo: "Autor (polo ativo)",
  passivo: "Réu (polo passivo)",
};

/** Um processo cadastrado pelo escritório. */
export interface Processo {
  id: string;
  /** Número CNJ só com os 20 dígitos. */
  numero: string;
  cliente: string;
  parteContraria?: string;
  polo: PoloCliente;
  /** Sigla do tribunal (TJSP, TRT2…). */
  tribunal?: string;
  /** Vara ou órgão julgador. */
  orgao?: string;
  /** Classe processual (tipo de ação). */
  classe?: string;
  /** Valor da causa em centavos. */
  valorCausa?: number;
  /** Pessoa da equipe responsável (id em `preferencias.equipe`). */
  responsavelId?: string;
  observacoes?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export type DadosProcesso = Omit<Processo, "id" | "criadoEm" | "atualizadoEm">;

export type ErrosProcesso = Partial<Record<keyof DadosProcesso, string>>;

export const LIMITES_PROCESSO = { texto: 200, observacoes: 5000, valorMaximo: 1e15 } as const;

export function digitos(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

/** Máscara do número CNJ enquanto se digita: NNNNNNN-DD.AAAA.J.TR.OOOO */
export function mascaraCNJ(v: string): string {
  const d = digitos(v).slice(0, 20);
  const partes = [d.slice(0, 7), d.slice(7, 9), d.slice(9, 13), d.slice(13, 14), d.slice(14, 16), d.slice(16, 20)];
  let out = partes[0];
  if (partes[1]) out += "-" + partes[1];
  for (const p of partes.slice(2)) if (p) out += "." + p;
  return out;
}

/** Resto da divisão por 97 de um número grande escrito em decimal. */
function mod97(n: string): number {
  let r = 0;
  for (const c of n) r = (r * 10 + Number(c)) % 97;
  return r;
}

/**
 * Confere os dígitos verificadores do número CNJ (Resolução CNJ 65/2008):
 * NNNNNNN-DD.AAAA.J.TR.OOOO, com DD = 98 − (NNNNNNN AAAA J TR OOOO 00 mod 97).
 */
export function cnjValido(numero: string): boolean {
  const d = digitos(numero);
  if (d.length !== 20) return false;
  const semDv = d.slice(0, 7) + d.slice(9);
  return 98 - mod97(`${semDv}00`) === Number(d.slice(7, 9));
}

/** Lê "R$ 1.234,56", "1234,5" ou "1234" e devolve centavos; texto vazio é `undefined`, inválido é `null`. */
export function lerValor(texto: string): number | undefined | null {
  const t = (texto ?? "").replace(/R\$|\s/gi, "");
  if (!t) return undefined;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) return null;
  const [inteiro, frac = ""] = t.replace(/\./g, "").split(",");
  return Number(inteiro) * 100 + Number(frac.padEnd(2, "0"));
}

export function formatarValor(centavos?: number): string {
  if (centavos === undefined) return "";
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Validação compartilhada pela tela e pelo servidor. */
export function validarProcesso(d: Partial<Record<keyof DadosProcesso, unknown>>): ErrosProcesso {
  const erros: ErrosProcesso = {};
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (!digitos(texto(d.numero))) erros.numero = "Informe o número do processo.";
  else if (digitos(texto(d.numero)).length !== 20) erros.numero = "O número CNJ tem 20 dígitos (NNNNNNN-DD.AAAA.J.TR.OOOO).";
  else if (!cnjValido(texto(d.numero))) erros.numero = "Número inválido: os dígitos verificadores não conferem.";
  if (!texto(d.cliente)) erros.cliente = "Informe o cliente.";
  if (d.polo !== "ativo" && d.polo !== "passivo") erros.polo = "Escolha o lado do cliente.";
  for (const campo of ["cliente", "parteContraria", "tribunal", "orgao", "classe", "responsavelId"] as const) {
    if (d[campo] !== undefined && typeof d[campo] !== "string") erros[campo] = "Valor inválido.";
    else if (texto(d[campo]).length > LIMITES_PROCESSO.texto) erros[campo] = `No máximo ${LIMITES_PROCESSO.texto} caracteres.`;
  }
  if (d.observacoes !== undefined && (typeof d.observacoes !== "string" || d.observacoes.length > LIMITES_PROCESSO.observacoes)) {
    erros.observacoes = `No máximo ${LIMITES_PROCESSO.observacoes} caracteres.`;
  }
  if (d.valorCausa !== undefined && (typeof d.valorCausa !== "number" || !Number.isSafeInteger(d.valorCausa) || d.valorCausa < 0 || d.valorCausa > LIMITES_PROCESSO.valorMaximo)) {
    erros.valorCausa = "Valor da causa inválido.";
  }
  return erros;
}

/** Normaliza os dados já validados: número só com dígitos, textos aparados, campos vazios removidos. */
export function normalizarProcesso(d: Partial<Record<keyof DadosProcesso, unknown>>): DadosProcesso {
  const opcional = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const r: DadosProcesso = {
    numero: digitos(String(d.numero)),
    cliente: String(d.cliente).trim(),
    parteContraria: opcional(d.parteContraria),
    polo: d.polo as PoloCliente,
    tribunal: opcional(d.tribunal)?.toUpperCase(),
    orgao: opcional(d.orgao),
    classe: opcional(d.classe),
    valorCausa: typeof d.valorCausa === "number" ? d.valorCausa : undefined,
    responsavelId: opcional(d.responsavelId),
    observacoes: opcional(d.observacoes),
  };
  return Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) as DadosProcesso;
}

/** Intimações do processo, ligadas pelo número CNJ, da mais recente para a mais antiga. */
export function intimacoesDoProcesso(intimacoes: Intimacao[], numero: string): Intimacao[] {
  const alvo = digitos(numero);
  return intimacoes
    .filter((i) => digitos(i.numeroProcesso) === alvo)
    .sort((a, b) => b.dataDisponibilizacao.localeCompare(a.dataDisponibilizacao));
}

/** PDF anexado a um processo. Os bytes ficam no armazenamento de arquivos; aqui só os metadados. */
export interface DocumentoProcesso {
  id: string;
  processoId: string;
  /** Nome do arquivo como foi enviado. */
  nome: string;
  /** Em bytes. */
  tamanho: number;
  /** sha256 do conteúdo, para não guardar o mesmo PDF duas vezes no processo. */
  hash: string;
  criadoEm: string;
}

export const LIMITES_DOCUMENTO = { bytes: 30 * 1024 * 1024, porProcesso: 200 } as const;

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

/** Uma versão do parecer do processo. Cada gravação cria uma versão nova; nenhuma é apagada. */
export interface ParecerProcesso {
  id: string;
  processoId: string;
  /** 1, 2, 3… dentro do processo. */
  versao: number;
  texto: string;
  autorId: string;
  /** Nome do autor quando escreveu (continua lá mesmo se ele sair do escritório). */
  autorNome: string;
  criadoEm: string;
}

export const LIMITES_PARECER = { caracteres: 50_000, versoes: 500 } as const;
