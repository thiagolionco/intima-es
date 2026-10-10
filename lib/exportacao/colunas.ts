import type { Intimacao } from "../types.ts";

export interface OpcoesFormatacao {
  formatoData: "br" | "iso";
  /** Quando falso, o inteiro teor é cortado em `limiteTexto` caracteres. */
  textoCompleto: boolean;
  limiteTexto: number;
}

export const FORMATACAO_PADRAO: OpcoesFormatacao = { formatoData: "br", textoCompleto: false, limiteTexto: 500 };

export interface ColunaExportacao {
  id: string;
  rotulo: string;
  /** Largura sugerida (em caracteres) para planilhas. */
  largura: number;
  obter(i: Intimacao, o: OpcoesFormatacao): string;
}

const STATUS: Record<string, string> = { nova: "Nova", em_analise: "Em análise", respondida: "Respondida", arquivada: "Arquivada" };

export function formatarData(iso: string | undefined, formato: OpcoesFormatacao["formatoData"]): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return formato === "iso" ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Catálogo de colunas exportáveis. Para oferecer uma coluna nova basta acrescentá-la aqui:
 * diálogo, pré-visualização e todos os formatos passam a suportá-la (aberto/fechado).
 */
export const COLUNAS: ColunaExportacao[] = [
  { id: "data", rotulo: "Data de disponibilização", largura: 14, obter: (i, o) => formatarData(i.dataDisponibilizacao, o.formatoData) },
  { id: "cliente", rotulo: "Cliente", largura: 24, obter: (i) => i.cliente },
  { id: "processo", rotulo: "Processo", largura: 27, obter: (i) => i.numeroProcesso },
  { id: "tribunal", rotulo: "Tribunal", largura: 10, obter: (i) => i.tribunal },
  { id: "orgao", rotulo: "Órgão", largura: 30, obter: (i) => i.orgao },
  { id: "tipoComunicacao", rotulo: "Tipo de comunicação", largura: 18, obter: (i) => i.tipoComunicacao },
  { id: "meio", rotulo: "Meio", largura: 8, obter: (i) => i.meio },
  { id: "tipoDocumento", rotulo: "Tipo de documento", largura: 18, obter: (i) => i.tipoDocumento },
  { id: "classe", rotulo: "Classe (tipo de ação)", largura: 26, obter: (i) => i.classe },
  { id: "partes", rotulo: "Partes", largura: 40, obter: (i) => i.partes.map((p) => (p.polo ? `${p.nome} (${p.polo})` : p.nome)).join(" | ") },
  { id: "advogados", rotulo: "Advogados", largura: 40, obter: (i) => i.advogados.map((a) => (a.oab ? `${a.nome} (OAB ${a.oab}/${a.uf})` : a.nome)).join(" | ") },
  { id: "status", rotulo: "Status", largura: 12, obter: (i) => STATUS[i.status] ?? i.status },
  { id: "prazo", rotulo: "Prazo", largura: 12, obter: (i, o) => formatarData(i.prazo, o.formatoData) },
  { id: "origem", rotulo: "Origem", largura: 13, obter: (i) => (i.origem === "comunica" ? "Comunica PJe" : "Manual") },
  { id: "observacoes", rotulo: "Observações", largura: 30, obter: (i) => i.observacoes ?? "" },
  {
    id: "texto",
    rotulo: "Inteiro teor",
    largura: 60,
    obter: (i, o) => (o.textoCompleto || i.texto.length <= o.limiteTexto ? i.texto : `${i.texto.slice(0, o.limiteTexto).trimEnd()}…`),
  },
  { id: "link", rotulo: "Link", largura: 30, obter: (i) => i.link ?? "" },
];

export interface PresetColunas {
  id: string;
  rotulo: string;
  colunas: string[];
}

export const PRESETS: PresetColunas[] = [
  { id: "essencial", rotulo: "Essencial", colunas: ["data", "cliente", "processo", "tribunal", "tipoComunicacao", "status", "prazo"] },
  { id: "prazos", rotulo: "Controle de prazos", colunas: ["prazo", "status", "cliente", "processo", "orgao", "tipoDocumento", "observacoes"] },
  { id: "completo", rotulo: "Completo", colunas: COLUNAS.map((c) => c.id) },
];

export interface Tabela {
  cabecalho: string[];
  linhas: string[][];
  larguras: number[];
}

export function montarTabela(lista: Intimacao[], colunasIds: string[], opcoes: OpcoesFormatacao = FORMATACAO_PADRAO): Tabela {
  const colunas = colunasIds.map((id) => COLUNAS.find((c) => c.id === id)).filter((c): c is ColunaExportacao => !!c);
  return {
    cabecalho: colunas.map((c) => c.rotulo),
    linhas: lista.map((i) => colunas.map((c) => c.obter(i, opcoes))),
    larguras: colunas.map((c) => c.largura),
  };
}
