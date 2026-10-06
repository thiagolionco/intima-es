import type { Intimacao } from "./types";

const STATUS: Record<string, string> = {
  nova: "Nova",
  em_analise: "Em análise",
  respondida: "Respondida",
  arquivada: "Arquivada",
};

function celula(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Ponto e vírgula é o separador que o Excel em português abre corretamente.
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function dataBR(iso?: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export const COLUNAS_CSV = [
  "Data de disponibilização",
  "Cliente",
  "Tribunal",
  "Órgão",
  "Tipo de comunicação",
  "Meio",
  "Tipo de documento",
  "Classe (tipo de ação)",
  "Processo",
  "Partes",
  "Advogados",
  "Status",
  "Prazo",
  "Origem",
  "Observações",
  "Texto",
  "Link",
];

export function intimacoesParaCSV(lista: Intimacao[]): string {
  const linhas = lista.map((i) =>
    [
      dataBR(i.dataDisponibilizacao),
      i.cliente,
      i.tribunal,
      i.orgao,
      i.tipoComunicacao,
      i.meio,
      i.tipoDocumento,
      i.classe,
      i.numeroProcesso,
      i.partes.map((p) => (p.polo ? `${p.nome} (${p.polo})` : p.nome)).join(" | "),
      i.advogados.map((a) => (a.oab ? `${a.nome} (OAB ${a.oab}/${a.uf})` : a.nome)).join(" | "),
      STATUS[i.status] ?? i.status,
      dataBR(i.prazo),
      i.origem === "comunica" ? "Comunica PJe" : "Manual",
      i.observacoes ?? "",
      i.texto,
      i.link ?? "",
    ]
      .map(celula)
      .join(";"),
  );
  return [COLUNAS_CSV.map(celula).join(";"), ...linhas].join("\r\n");
}

/** Dispara o download de um CSV no navegador (com BOM para o Excel reconhecer UTF-8). */
export function baixarCSV(conteudo: string, nomeArquivo: string): void {
  const blob = new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
