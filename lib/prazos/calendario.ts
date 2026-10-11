import type { Suspensao } from "../types.ts";
import { diaDaSemana, montarData, somarDias } from "./datas.ts";

/**
 * Calendário forense usado na contagem de prazos.
 *
 * Só entram aqui os dias em que é seguro dizer que não há expediente em todo o país. Um dia a
 * mais no calendário empurraria o vencimento para depois do real, que é o erro perigoso; um dia
 * a menos só antecipa o vencimento. Feriados estaduais, municipais e suspensões de cada tribunal
 * são cadastrados pelo escritório como `Suspensao`.
 */

export interface DiaSemExpediente {
  data: string;
  motivo: string;
  /**
   * Suspende a contagem mesmo em prazos de dias corridos (recesso, suspensões por portaria).
   * Feriados comuns não suspendem: só adiam o início ou o vencimento.
   */
  suspendePrazo: boolean;
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return montarData(ano, mes, dia);
}

/** Justiça Federal e tribunais superiores seguem o art. 62 da Lei 5.010/1966. */
export function ehJusticaFederal(tribunal: string): boolean {
  return /^(TRF\d|STJ|STF|CJF|JF)/i.test((tribunal ?? "").trim());
}

/** Feriados nacionais (e, para a Justiça Federal, os da Lei 5.010/1966) de um ano. */
export function feriadosDoAno(ano: number, tribunal = ""): DiaSemExpediente[] {
  const f = (mes: number, dia: number, motivo: string) => ({ data: montarData(ano, mes, dia), motivo, suspendePrazo: false });
  const p = pascoa(ano);
  const movel = (delta: number, motivo: string) => ({ data: somarDias(p, delta), motivo, suspendePrazo: false });

  const lista: DiaSemExpediente[] = [
    f(1, 1, "Confraternização Universal"),
    f(4, 21, "Tiradentes"),
    f(5, 1, "Dia do Trabalho"),
    f(9, 7, "Independência do Brasil"),
    f(10, 12, "Nossa Senhora Aparecida"),
    f(11, 2, "Finados"),
    f(11, 15, "Proclamação da República"),
    f(12, 25, "Natal"),
    movel(-48, "Carnaval"),
    movel(-47, "Carnaval"),
    movel(-2, "Sexta-feira Santa"),
  ];
  if (ano >= 2024) lista.push(f(11, 20, "Dia Nacional de Zumbi e da Consciência Negra"));

  if (ehJusticaFederal(tribunal)) {
    lista.push(
      movel(-4, "Semana Santa (Lei 5.010/1966)"),
      movel(-3, "Semana Santa (Lei 5.010/1966)"),
      f(8, 11, "Dia do Advogado e dos Cursos Jurídicos (Lei 5.010/1966)"),
      f(11, 1, "Todos os Santos (Lei 5.010/1966)"),
      f(12, 8, "Dia da Justiça (Lei 5.010/1966)"),
    );
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}

/** Recesso de 20/12 a 20/01: art. 220 do CPC, art. 775-A da CLT e art. 798-A do CPP. */
export function emRecesso(data: string): boolean {
  const md = data.slice(5);
  return md >= "12-20" || md <= "01-20";
}

const MOTIVO_RECESSO = "Recesso forense (20/12 a 20/01, art. 220 do CPC)";

function vale(s: Suspensao, tribunal: string): boolean {
  const alvo = (s.tribunal ?? "").trim().toUpperCase();
  return !alvo || alvo === tribunal.trim().toUpperCase();
}

/** Calendário de um tribunal, com as suspensões cadastradas pelo escritório. */
export class Calendario {
  readonly tribunal: string;
  private readonly suspensoes: Suspensao[];
  private readonly feriados = new Map<number, Map<string, string>>();

  constructor(tribunal: string, suspensoes: Suspensao[] = []) {
    this.tribunal = tribunal ?? "";
    this.suspensoes = suspensoes.filter((s) => vale(s, this.tribunal) && s.inicio && s.fim && s.inicio <= s.fim);
  }

  private feriado(data: string): string | null {
    const ano = Number(data.slice(0, 4));
    let mapa = this.feriados.get(ano);
    if (!mapa) {
      mapa = new Map();
      for (const f of feriadosDoAno(ano, this.tribunal)) if (!mapa.has(f.data)) mapa.set(f.data, f.motivo);
      this.feriados.set(ano, mapa);
    }
    return mapa.get(data) ?? null;
  }

  /** Motivo de a contagem parar neste dia, mesmo em dias corridos; null se não houver. */
  suspensao(data: string): string | null {
    const s = this.suspensoes.find((x) => x.inicio <= data && data <= x.fim);
    if (s) return s.descricao || "Suspensão de prazos";
    return emRecesso(data) ? MOTIVO_RECESSO : null;
  }

  /** Motivo de não haver expediente no dia (fim de semana, feriado ou suspensão); null se for dia útil. */
  motivo(data: string): string | null {
    const dia = diaDaSemana(data);
    if (dia === 0) return "domingo";
    if (dia === 6) return "sábado";
    return this.feriado(data) ?? this.suspensao(data);
  }

  ehUtil(data: string): boolean {
    return this.motivo(data) === null;
  }

  /** Primeiro dia útil estritamente depois de `data`. */
  proximoUtil(data: string): string {
    let d = somarDias(data, 1);
    for (let i = 0; i < 400 && !this.ehUtil(d); i++) d = somarDias(d, 1);
    return d;
  }

  /** Dias sem expediente de um ano, para conferência (sem os fins de semana). */
  diasDoAno(ano: number): DiaSemExpediente[] {
    const lista = feriadosDoAno(ano, this.tribunal);
    for (const s of this.suspensoes) {
      for (let d = s.inicio; d <= s.fim; d = somarDias(d, 1)) {
        if (d.startsWith(String(ano))) lista.push({ data: d, motivo: s.descricao || "Suspensão de prazos", suspendePrazo: true });
      }
    }
    return lista.sort((a, b) => a.data.localeCompare(b.data));
  }
}
