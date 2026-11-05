/**
 * Peças comuns às calculadoras: dinheiro, números no formato brasileiro, datas por anos e meses
 * e a "memória de cálculo" que cada calculadora devolve para o advogado conferir e copiar.
 */
import { dataBR, dataValida, diasEntre, montarData, somarDias } from "../prazos/datas.ts";

/** Arredonda para centavos (meio para cima), como nas planilhas de cálculo judiciais. */
export function centavos(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Math.sign(v) * Number.EPSILON) * 100) / 100;
}

/** "R$ 1.234,56". */
export function reais(v: number): string {
  return centavos(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "12,5%" (até 4 casas, sem zeros sobrando). */
export function pct(v: number, casas = 4): string {
  return `${Number(v.toFixed(casas)).toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;
}

/** "1.234,5678" (até 4 casas). */
export function numeroBR(v: number, casas = 4): string {
  return Number(v.toFixed(casas)).toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

/**
 * Lê "1.234,56", "1234,56", "1234.56" ou "R$ 1.234". Devolve null quando não é número.
 * Com vírgula, o ponto é separador de milhar; sem vírgula, um único ponto seguido de 1 ou 2
 * dígitos é decimal ("10.5"), e os demais pontos são de milhar ("1.234.567").
 */
export function lerNumero(s: string | number | null | undefined): number | null {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  let t = (s ?? "").replace(/R\$|%|\s/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (!/^-?\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Uma linha da memória de cálculo: o que é, quanto deu, como chegou lá e em que lei se apoia. */
export interface Linha {
  rotulo: string;
  valor: string;
  /** Conta feita, por extenso: "R$ 3.000,00 ÷ 30 × 12 dias". */
  conta?: string;
  /** Dispositivo legal ou súmula. */
  base?: string;
  destaque?: boolean;
}

/** Texto simples da memória, para colar numa petição ou num e-mail. */
export function memoriaEmTexto(titulo: string, linhas: Linha[], avisos: string[] = []): string {
  const corpo = linhas.map((l) => {
    const extra = [l.conta, l.base && `(${l.base})`].filter(Boolean).join(" ");
    return `- ${l.rotulo}: ${l.valor}${extra ? ` — ${extra}` : ""}`;
  });
  const obs = avisos.length ? ["", "Observações:", ...avisos.map((a) => `- ${a}`)] : [];
  return [titulo, "", ...corpo, ...obs, "", "Cálculo feito no Clepsa. Confira antes de usar."].join("\n");
}

// ---------- Datas por anos e meses ----------

function partes(s: string) {
  const [a, m, d] = s.split("-").map(Number);
  return { a, m, d };
}

function ultimoDia(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Soma meses mantendo o dia. Sem dia igual no mês final (31/01 + 1 mês), `ajuste` decide:
 * "seguinte" vai para o primeiro dia do mês seguinte (Código Civil, art. 132, § 3º);
 * "ultimo" fica no último dia do mês (contagem de avos e de períodos).
 */
export function somarMeses(s: string, meses: number, ajuste: "seguinte" | "ultimo" = "seguinte"): string {
  const { a, m, d } = partes(s);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const fim = ultimoDia(ano, mes);
  if (d <= fim) return montarData(ano, mes, d);
  return ajuste === "ultimo" ? montarData(ano, mes, fim) : somarDias(montarData(ano, mes, fim), 1);
}

export function somarAnos(s: string, anos: number, ajuste: "seguinte" | "ultimo" = "seguinte"): string {
  return somarMeses(s, anos * 12, ajuste);
}

/** Anos completos entre duas datas (aniversários já ocorridos até `ate`, inclusive). */
export function anosCompletos(de: string, ate: string): number {
  let n = 0;
  while (somarAnos(de, n + 1, "ultimo") <= ate) n++;
  return n;
}

/**
 * Meses completos de `de` até `ate` (inclusive) e os dias que sobram. Um mês se completa no dia
 * anterior ao de igual número do mês seguinte (10/03 a 09/04).
 */
export function mesesEDias(de: string, ate: string): { meses: number; dias: number } {
  if (ate < de) return { meses: 0, dias: 0 };
  let meses = 0;
  while (somarDias(somarMeses(de, meses + 1, "ultimo"), -1) <= ate) meses++;
  const resto = somarMeses(de, meses, "ultimo");
  return { meses, dias: diasEntre(resto, ate) + 1 };
}

export { dataBR, dataValida, diasEntre, somarDias };

// ---------- Durações penais (anos, meses e dias) ----------

/** Duração em anos, meses e dias. Nas contas, 1 ano = 12 meses e 1 mês = 30 dias. */
export interface Duracao {
  anos: number;
  meses: number;
  dias: number;
}

export const DIAS_NO_MES = 30;
export const DIAS_NO_ANO = 360;

export function emDias(d: Partial<Duracao>): number {
  return Math.floor((d.anos ?? 0) * DIAS_NO_ANO + (d.meses ?? 0) * DIAS_NO_MES + (d.dias ?? 0));
}

/** Converte dias em anos, meses e dias, desprezando frações de dia (Código Penal, art. 11). */
export function deDias(total: number): Duracao {
  const t = Math.max(0, Math.floor(total + 1e-9));
  return { anos: Math.floor(t / DIAS_NO_ANO), meses: Math.floor((t % DIAS_NO_ANO) / DIAS_NO_MES), dias: t % DIAS_NO_MES };
}

/** "5 anos, 10 meses e 15 dias". */
export function duracaoTexto(d: Duracao | number): string {
  const x = typeof d === "number" ? deDias(d) : d;
  const p: string[] = [];
  if (x.anos) p.push(`${x.anos} ${x.anos === 1 ? "ano" : "anos"}`);
  if (x.meses) p.push(`${x.meses} ${x.meses === 1 ? "mês" : "meses"}`);
  if (x.dias) p.push(`${x.dias} ${x.dias === 1 ? "dia" : "dias"}`);
  if (!p.length) return "0 dia";
  return p.length === 1 ? p[0] : `${p.slice(0, -1).join(", ")} e ${p[p.length - 1]}`;
}

/** Soma uma duração a uma data, pelo calendário (anos, depois meses, depois dias). */
export function somarDuracao(data: string, d: Duracao): string {
  return somarDias(somarMeses(data, d.anos * 12 + d.meses, "ultimo"), d.dias);
}

/** Fração "1/6", "2/3". */
export interface Fracao {
  num: number;
  den: number;
}

export function fracaoTexto(f: Fracao): string {
  return `${f.num}/${f.den}`;
}

export function dataTexto(s: string): string {
  return dataValida(s) ? dataBR(s) : "—";
}
