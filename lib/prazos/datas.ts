/**
 * Aritmética de datas no formato AAAA-MM-DD, sem fuso horário: as contas são feitas em UTC
 * para que horário de verão ou o fuso do servidor nunca desloquem um dia.
 */

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dataValida(s: string): boolean {
  const m = RE.exec(s ?? "");
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function paraUtc(s: string): Date {
  const [a, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function deUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function somarDias(s: string, n: number): string {
  const d = paraUtc(s);
  d.setUTCDate(d.getUTCDate() + n);
  return deUtc(d);
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(s: string): number {
  return paraUtc(s).getUTCDay();
}

export function montarData(ano: number, mes: number, dia: number): string {
  return deUtc(new Date(Date.UTC(ano, mes - 1, dia)));
}

export function diasEntre(de: string, ate: string): number {
  return Math.round((paraUtc(ate).getTime() - paraUtc(de).getTime()) / 86_400_000);
}

export const NOMES_DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** "25/10/2026". */
export function dataBR(s: string): string {
  const [a, m, d] = s.split("-");
  return `${d}/${m}/${a}`;
}
