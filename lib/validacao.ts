import type { Advogado, Parte, RegraPrazo, StatusIntimacao, TermoMonitorado } from "./types";

export interface DadosFormulario {
  cliente: string;
  tribunal: string;
  orgao: string;
  dataDisponibilizacao: string;
  tipoComunicacao: string;
  meio: string;
  tipoDocumento: string;
  classe: string;
  numeroProcesso: string;
  partes: Parte[];
  advogados: Advogado[];
  texto: string;
  link: string;
  status: StatusIntimacao;
  prazo: string;
  /** Regra do cálculo automático; null quando o prazo é uma data informada à mão. */
  regraPrazo?: RegraPrazo | null;
  observacoes: string;
}

export type ErrosFormulario = Partial<Record<keyof DadosFormulario | `partes.${number}` | `advogados.${number}`, string>>;

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(s: string): boolean {
  if (!RE_DATA.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function validarIntimacao(d: DadosFormulario, hoje: string): ErrosFormulario {
  const e: ErrosFormulario = {};
  if (!d.cliente.trim()) e.cliente = "Informe o cliente.";
  if (!d.tribunal.trim()) e.tribunal = "Informe o tribunal (ex.: TJSP, TRT2).";
  else if (!/^[A-Za-z0-9]{2,10}$/.test(d.tribunal.trim())) e.tribunal = "Use apenas a sigla do tribunal (2 a 10 letras/números).";
  if (!d.orgao.trim()) e.orgao = "Informe o órgão julgador.";
  if (!d.dataDisponibilizacao) e.dataDisponibilizacao = "Informe a data de disponibilização.";
  else if (!dataValida(d.dataDisponibilizacao)) e.dataDisponibilizacao = "Data inválida.";
  else if (d.dataDisponibilizacao > hoje) e.dataDisponibilizacao = "A data de disponibilização não pode estar no futuro.";
  if (!d.tipoComunicacao.trim()) e.tipoComunicacao = "Selecione o tipo de comunicação.";
  if (!d.meio.trim()) e.meio = "Selecione o meio.";

  const digitos = d.numeroProcesso.replace(/\D/g, "");
  if (!digitos) e.numeroProcesso = "Informe o número do processo.";
  else if (digitos.length !== 20) e.numeroProcesso = "O número CNJ deve ter 20 dígitos.";

  if (d.texto.trim().length < 10) e.texto = "O texto da intimação deve ter ao menos 10 caracteres.";
  if (d.link.trim() && !/^https?:\/\/\S+$/i.test(d.link.trim())) e.link = "Informe uma URL válida (http/https).";

  if (d.regraPrazo) {
    const n = d.regraPrazo.dias;
    if (!Number.isInteger(n) || n < 1 || n > 365) e.prazo = "Informe de 1 a 365 dias.";
  } else if (d.prazo) {
    if (!dataValida(d.prazo)) e.prazo = "Data inválida.";
    else if (dataValida(d.dataDisponibilizacao) && d.prazo < d.dataDisponibilizacao) {
      e.prazo = "O prazo não pode ser anterior à disponibilização.";
    }
  }

  const partesPreenchidas = d.partes.filter((p) => p.nome.trim());
  if (partesPreenchidas.length === 0) e.partes = "Informe ao menos uma parte.";
  d.advogados.forEach((a, idx) => {
    if (!a.nome.trim() && !a.oab.trim()) return;
    if (!a.nome.trim()) e[`advogados.${idx}`] = "Informe o nome do advogado.";
    else if (a.oab.trim() && !/^\d{1,7}[A-Za-z]?$/.test(a.oab.trim())) e[`advogados.${idx}`] = "OAB inválida.";
    else if (a.oab.trim() && !a.uf) e[`advogados.${idx}`] = "Informe a UF da OAB.";
  });
  return e;
}

export function validarTermo(t: Pick<TermoMonitorado, "apelido" | "tipo" | "valor" | "ufOab" | "tribunal">): Partial<Record<"apelido" | "valor" | "ufOab" | "tribunal", string>> {
  const e: Partial<Record<"apelido" | "valor" | "ufOab" | "tribunal", string>> = {};
  if (!t.apelido.trim()) e.apelido = "Dê um nome ao cliente.";
  const v = t.valor.trim();
  if (!v) e.valor = "Informe o valor a pesquisar.";
  else if (t.tipo === "parte" && v.length < 3) e.valor = "Use ao menos 3 caracteres.";
  else if (t.tipo === "advogado" && v.length < 5) e.valor = "Informe o nome completo do advogado.";
  else if (t.tipo === "oab" && !/^\d{1,7}$/.test(v.replace(/\D/g, ""))) e.valor = "Informe apenas os números da OAB.";
  else if (t.tipo === "processo" && v.replace(/\D/g, "").length !== 20) e.valor = "O número CNJ deve ter 20 dígitos.";
  if (t.tipo === "oab" && !t.ufOab) e.ufOab = "Selecione a UF.";
  if (t.tribunal && !/^[A-Za-z0-9]{2,10}$/.test(t.tribunal.trim())) e.tribunal = "Sigla inválida.";
  return e;
}
