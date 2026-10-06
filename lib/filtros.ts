import type { FiltrosIntimacao, Intimacao } from "./types";

export const FILTROS_VAZIOS: FiltrosIntimacao = {
  busca: "",
  dataInicio: "",
  dataFim: "",
  tipoComunicacao: "",
  status: "",
  cliente: "",
  tribunal: "",
};

function norm(s: string | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Texto em que a busca livre procura: processo, partes, advogados, órgão, classe, texto etc. */
function textoPesquisavel(i: Intimacao): string {
  return norm(
    [
      i.numeroProcesso,
      i.numeroProcesso.replace(/\D/g, ""),
      i.cliente,
      i.tribunal,
      i.orgao,
      i.classe,
      i.tipoComunicacao,
      i.tipoDocumento,
      i.observacoes,
      i.texto,
      ...i.partes.map((p) => p.nome),
      ...i.advogados.map((a) => `${a.nome} ${a.oab}`),
    ].join(" "),
  );
}

export function filtrarIntimacoes(lista: Intimacao[], f: FiltrosIntimacao): Intimacao[] {
  const termos = norm(f.busca).split(/\s+/).filter(Boolean);
  return lista.filter((i) => {
    if (f.dataInicio && i.dataDisponibilizacao < f.dataInicio) return false;
    if (f.dataFim && i.dataDisponibilizacao > f.dataFim) return false;
    if (f.tipoComunicacao && i.tipoComunicacao !== f.tipoComunicacao) return false;
    if (f.status && i.status !== f.status) return false;
    if (f.cliente && i.cliente !== f.cliente) return false;
    if (f.tribunal && i.tribunal !== f.tribunal) return false;
    if (termos.length) {
      const alvo = textoPesquisavel(i);
      if (!termos.every((t) => alvo.includes(t))) return false;
    }
    return true;
  });
}

export type Ordenacao = "data_desc" | "data_asc" | "prazo" | "tribunal";

export function ordenarIntimacoes(lista: Intimacao[], ordem: Ordenacao): Intimacao[] {
  const copia = [...lista];
  switch (ordem) {
    case "data_asc":
      return copia.sort((a, b) => a.dataDisponibilizacao.localeCompare(b.dataDisponibilizacao));
    case "prazo":
      return copia.sort((a, b) => (a.prazo || "9999").localeCompare(b.prazo || "9999"));
    case "tribunal":
      return copia.sort((a, b) => a.tribunal.localeCompare(b.tribunal) || b.dataDisponibilizacao.localeCompare(a.dataDisponibilizacao));
    default:
      return copia.sort((a, b) => b.dataDisponibilizacao.localeCompare(a.dataDisponibilizacao));
  }
}

export function contarFiltrosAtivos(f: FiltrosIntimacao): number {
  return (Object.keys(FILTROS_VAZIOS) as (keyof FiltrosIntimacao)[]).filter((k) => k !== "busca" && f[k]).length;
}
