import type { Tabela } from "./colunas.ts";
import { criarZip } from "./zip.ts";

export interface ContextoExportacao {
  titulo: string;
  /** Linhas de contexto para cabeçalhos de relatório (usuário, filtros, data). */
  metadados: string[];
  incluirCabecalho: boolean;
  separadorCsv: ";" | "," | "\t";
  bomUtf8: boolean;
}

export type OpcaoFormato = "cabecalho" | "separador" | "bom";

/**
 * Um formato de saída. O diálogo só conhece esta interface: para criar um formato novo
 * (ODS, Markdown…) basta implementá-la e registrá-la em FORMATOS.
 */
export interface FormatoExportacao {
  id: string;
  rotulo: string;
  descricao: string;
  extensao: string;
  mime: string;
  opcoes: OpcaoFormato[];
  /** "download" gera arquivo; "imprimir" abre o relatório pronto para salvar em PDF. */
  entrega: "download" | "imprimir";
  gerar(tabela: Tabela, ctx: ContextoExportacao): string | Uint8Array;
}

// ---------- CSV ----------

function celulaCsv(v: string, sep: string): string {
  return v.includes(sep) || /["\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export const formatoCsv: FormatoExportacao = {
  id: "csv",
  rotulo: "CSV",
  descricao: "Texto separado; abre em qualquer planilha ou sistema",
  extensao: "csv",
  mime: "text/csv;charset=utf-8",
  opcoes: ["cabecalho", "separador", "bom"],
  entrega: "download",
  gerar(t, ctx) {
    const sep = ctx.separadorCsv;
    const linhas = [...(ctx.incluirCabecalho ? [t.cabecalho] : []), ...t.linhas].map((l) => l.map((c) => celulaCsv(c, sep)).join(sep));
    return (ctx.bomUtf8 ? "﻿" : "") + linhas.join("\r\n");
  },
};

// ---------- XLSX ----------

function xml(s: string): string {
  // Remove caracteres de controle proibidos em XML 1.0.
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function colunaExcel(n: number): string {
  let s = "";
  for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function gerarXlsx(t: Tabela, ctx: Pick<ContextoExportacao, "titulo" | "incluirCabecalho">): Uint8Array {
  const linhas = [...(ctx.incluirCabecalho ? [t.cabecalho] : []), ...t.linhas];
  const ultimaCol = colunaExcel(Math.max(0, t.cabecalho.length - 1));
  const sheetRows = linhas
    .map((linha, r) => {
      const estilo = ctx.incluirCabecalho && r === 0 ? ' s="1"' : ' s="2"';
      const cels = linha.map((v, c) => `<c r="${colunaExcel(c)}${r + 1}" t="inlineStr"${estilo}><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join("");
      return `<row r="${r + 1}">${cels}</row>`;
    })
    .join("");
  const cols = t.larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w + 2}" customWidth="1"/>`).join("");
  const congelar = ctx.incluirCabecalho ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : "";
  const filtro = ctx.incluirCabecalho && linhas.length > 1 ? `<autoFilter ref="A1:${ultimaCol}${linhas.length}"/>` : "";
  const nomeAba = xml(ctx.titulo.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Intimações");

  return criarZip([
    {
      nome: "[Content_Types].xml",
      conteudo:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    },
    {
      nome: "_rels/.rels",
      conteudo:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      nome: "xl/workbook.xml",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${nomeAba}" sheetId="1" r:id="rId1"/></sheets>${filtro ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${nomeAba.replace(/'/g, "''")}'!$A$1:$${ultimaCol}$${linhas.length}</definedName></definedNames>` : ""}</workbook>`,
    },
    {
      nome: "xl/_rels/workbook.xml.rels",
      conteudo:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    },
    {
      nome: "xl/styles.xml",
      conteudo:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="0"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    },
    {
      nome: "xl/worksheets/sheet1.xml",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${congelar}<cols>${cols}</cols><sheetData>${sheetRows}</sheetData>${filtro}</worksheet>`,
    },
  ]);
}

export const formatoXlsx: FormatoExportacao = {
  id: "xlsx",
  rotulo: "Excel",
  descricao: "Planilha .xlsx com cabeçalho fixo e filtros prontos",
  extensao: "xlsx",
  mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  opcoes: ["cabecalho"],
  entrega: "download",
  gerar: (t, ctx) => gerarXlsx(t, ctx),
};

// ---------- JSON ----------

export const formatoJson: FormatoExportacao = {
  id: "json",
  rotulo: "JSON",
  descricao: "Dados estruturados para integrações e automações",
  extensao: "json",
  mime: "application/json",
  opcoes: [],
  entrega: "download",
  gerar(t, ctx) {
    const registros = t.linhas.map((l) => Object.fromEntries(t.cabecalho.map((c, i) => [c, l[i]])));
    return JSON.stringify({ titulo: ctx.titulo, geradoEm: new Date().toISOString(), contexto: ctx.metadados, total: registros.length, registros }, null, 2);
  },
};

// ---------- Relatório (PDF via impressão) ----------

function html(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function gerarRelatorioHtml(t: Tabela, ctx: Pick<ContextoExportacao, "titulo" | "metadados">): string {
  const cab = t.cabecalho.map((c) => `<th>${html(c)}</th>`).join("");
  const corpo = t.linhas.map((l) => `<tr>${l.map((c) => `<td>${html(c)}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${html(ctx.titulo)}</title><style>
    @page { size: A4 landscape; margin: 14mm 12mm; }
    * { box-sizing: border-box; }
    body { font: 10px/1.4 "Segoe UI", Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; }
    header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
    h1 { font-size: 16px; margin: 0; } .meta { color: #475569; font-size: 9px; text-align: right; }
    table { width: 100%; border-collapse: collapse; } thead { display: table-header-group; }
    th { background: #0f172a; color: #fff; text-align: left; padding: 5px 6px; font-weight: 600; }
    td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; word-break: break-word; }
    tr:nth-child(even) td { background: #f8fafc; } tr { page-break-inside: avoid; }
    footer { margin-top: 10px; color: #64748b; font-size: 9px; }
    .aviso { background: #fef3c7; border: 1px solid #fcd34d; padding: 8px 10px; margin-bottom: 10px; border-radius: 6px; font-size: 11px; }
    @media print { .aviso { display: none; } }
  </style></head><body>
  <div class="aviso">Use <strong>Ctrl+P</strong> (ou ⌘+P) e escolha <strong>Salvar como PDF</strong> como destino.</div>
  <header><div><h1>${html(ctx.titulo)}</h1><div>${t.linhas.length} registro(s)</div></div><div class="meta">${ctx.metadados.map(html).join("<br>")}</div></header>
  <table><thead><tr>${cab}</tr></thead><tbody>${corpo}</tbody></table>
  <footer>Gerado pela Clepsa em ${html(new Date().toLocaleString("pt-BR"))}</footer>
  <script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });</script>
  </body></html>`;
}

export const formatoPdf: FormatoExportacao = {
  id: "pdf",
  rotulo: "PDF / Impressão",
  descricao: "Relatório paginado em A4 paisagem, pronto para arquivar",
  extensao: "pdf",
  mime: "text/html;charset=utf-8",
  opcoes: [],
  entrega: "imprimir",
  gerar: (t, ctx) => gerarRelatorioHtml(t, ctx),
};

/** Registro de formatos disponíveis no diálogo, na ordem em que aparecem. */
export const FORMATOS: FormatoExportacao[] = [formatoXlsx, formatoCsv, formatoPdf, formatoJson];

/** TSV para colar direto no Excel/Google Planilhas. */
export function tabelaParaTsv(t: Tabela, incluirCabecalho = true): string {
  const limpar = (s: string) => s.replace(/[\t\r\n]+/g, " ");
  return [...(incluirCabecalho ? [t.cabecalho] : []), ...t.linhas].map((l) => l.map(limpar).join("\t")).join("\n");
}

/** Nome de arquivo seguro para Windows, macOS e Linux. */
export function nomeArquivoSeguro(nome: string, extensao: string): string {
  const base =
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 80) || "intimacoes";
  return `${base.replace(new RegExp(`\\.${extensao}$`, "i"), "")}.${extensao}`;
}
