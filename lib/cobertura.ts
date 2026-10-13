/**
 * Livro de cobertura: para cada termo monitorado e cada dia de disponibilização, se a busca
 * automática conseguiu verificar o dia no Comunica. "Nenhuma intimação" só vale para dias verificados.
 *
 * Funções puras, usadas pela ronda (servidor) e pelo Selo de Vigília (tela).
 */
import { dividirPeriodo } from "./comunica.ts";
import { somarDias } from "./prazos/datas.ts";
import type { TermoMonitorado, TipoTermo } from "./types.ts";

export type EstadoCobertura = "NAO_VERIFICADO" | "VERIFICADO_COM_RESULTADOS" | "VERIFICADO_SEM_RESULTADOS" | "PARCIAL" | "FALHOU";

export interface DiaCoberto {
  termoId: string;
  /** Dia de disponibilização (AAAA-MM-DD). */
  dia: string;
  estado: EstadoCobertura;
  /** Comunicações lidas neste dia. */
  lidos: number;
  /** `count` do Comunica, quando a consulta foi só deste dia. */
  esperados?: number;
  /** Tempo da consulta que cobriu o dia, em ms. */
  latenciaMs?: number;
  erro?: string;
  /** Quantas vezes a ronda passou por este dia. */
  tentativas: number;
  /** Quando o estado foi registrado (ISO). */
  verificadoEm: string;
}

/** Como terminou a leitura de uma janela do período (ver server/comunica/busca.ts). */
export interface JanelaDaBusca {
  inicio: string;
  fim: string;
  estado: "completa" | "parcial" | "falhou";
  lidos: number;
  esperados?: number;
  ms: number;
  erro?: string;
}

/** Tipos de termo procurados pela ronda automática. Os demais não têm cobertura. */
export const TIPOS_COM_COBERTURA: TipoTermo[] = ["oab", "processo"];

/** Quantos dias para trás o selo e a faixa de aviso olham. Igual ao limite da ronda. */
export const DIAS_DE_VIGILIA = 30;

export const verificado = (e: EstadoCobertura) => e === "VERIFICADO_COM_RESULTADOS" || e === "VERIFICADO_SEM_RESULTADOS";

/** Hoje (AAAA-MM-DD) no fuso de Brasília, que é o das datas do DJEN. */
export function diaEmBrasilia(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

/**
 * Transforma o que a busca leu em um registro por dia do período pedido.
 * Dia que nenhuma janela alcançou fica NAO_VERIFICADO; dia de janela que falhou, FALHOU.
 */
export function diasDaBusca(
  termoId: string,
  periodo: { inicio: string; fim: string },
  janelas: JanelaDaBusca[],
  diasDosItens: string[],
  agoraISO: string,
  erroGeral?: string,
): DiaCoberto[] {
  const porDia = new Map<string, number>();
  for (const d of diasDosItens) porDia.set(d, (porDia.get(d) ?? 0) + 1);
  const registros = new Map<string, DiaCoberto>();
  for (const j of janelas) {
    const umDia = j.inicio === j.fim;
    for (const { inicio: dia } of dividirPeriodo(j.inicio, j.fim, 1)) {
      const lidos = porDia.get(dia) ?? 0;
      const estado: EstadoCobertura =
        j.estado === "completa" ? (lidos ? "VERIFICADO_COM_RESULTADOS" : "VERIFICADO_SEM_RESULTADOS") : j.estado === "parcial" ? "PARCIAL" : "FALHOU";
      registros.set(dia, {
        termoId,
        dia,
        estado,
        lidos,
        ...(umDia && j.esperados !== undefined ? { esperados: j.esperados } : {}),
        latenciaMs: j.ms,
        ...(j.erro ? { erro: j.erro } : {}),
        tentativas: 1,
        verificadoEm: agoraISO,
      });
    }
  }
  for (const { inicio: dia } of dividirPeriodo(periodo.inicio, periodo.fim, 1)) {
    if (registros.has(dia)) continue;
    registros.set(dia, {
      termoId,
      dia,
      estado: erroGeral ? "FALHOU" : "NAO_VERIFICADO",
      lidos: porDia.get(dia) ?? 0,
      erro: erroGeral ?? "A busca parou antes de chegar a este dia.",
      tentativas: 1,
      verificadoEm: agoraISO,
    });
  }
  return [...registros.values()].sort((a, b) => b.dia.localeCompare(a.dia));
}

/**
 * Junta um registro novo ao anterior do mesmo termo e dia. Um dia já verificado não volta a
 * ser lacuna porque uma repetição falhou: a verificação anterior continua valendo.
 */
export function mesclarDia(anterior: DiaCoberto | undefined, novo: DiaCoberto): DiaCoberto {
  if (!anterior) return novo;
  const tentativas = anterior.tentativas + 1;
  if (verificado(novo.estado) || !verificado(anterior.estado)) return { ...novo, tentativas };
  return { ...anterior, tentativas };
}

export interface Lacuna {
  termoId: string;
  apelido: string;
  dia: string;
  estado: EstadoCobertura;
  erro?: string;
}

export interface ResumoCobertura {
  /** Se a busca automática está ligada no servidor. */
  rondaLigada: boolean;
  intervaloHoras: number;
  /** Termos ativos que a ronda procura. */
  termos: number;
  /** Última ronda (ISO) entre esses termos. */
  ultimaRonda?: string;
  /** Dias não verificados, do mais recente para o mais antigo. */
  lacunas: Lacuna[];
}

/**
 * Dias sem verificação de cada termo automático: do primeiro dia registrado (no máximo
 * DIAS_DE_VIGILIA atrás) até o dia da última ronda do termo.
 */
export function resumirCobertura(
  termos: TermoMonitorado[],
  dias: DiaCoberto[],
  op: { agora: Date; rondaLigada: boolean; intervaloHoras: number },
): ResumoCobertura {
  const ativos = termos.filter((t) => t.ativo && TIPOS_COM_COBERTURA.includes(t.tipo));
  const limite = somarDias(diaEmBrasilia(op.agora), -DIAS_DE_VIGILIA);
  const porTermo = new Map<string, Map<string, DiaCoberto>>();
  for (const d of dias) {
    if (d.dia < limite) continue;
    const m = porTermo.get(d.termoId) ?? new Map<string, DiaCoberto>();
    m.set(d.dia, d);
    porTermo.set(d.termoId, m);
  }
  const lacunas: Lacuna[] = [];
  let ultimaRonda: string | undefined;
  for (const t of ativos) {
    const em = t.ultimaRonda?.em;
    if (!em) continue;
    if (!ultimaRonda || em > ultimaRonda) ultimaRonda = em;
    const registros = porTermo.get(t.id);
    if (!registros?.size) {
      // Rodou, mas não há livro (ronda anterior ao livro de cobertura): só a falha do termo conta.
      if (t.ultimaRonda?.erro)
        lacunas.push({ termoId: t.id, apelido: t.apelido, dia: diaEmBrasilia(new Date(em)), estado: "FALHOU", erro: t.ultimaRonda.erro });
      continue;
    }
    const primeiro = [...registros.keys()].sort()[0];
    const ultimo = diaEmBrasilia(new Date(em));
    for (const { inicio: dia } of dividirPeriodo(primeiro, ultimo, 1)) {
      const r = registros.get(dia);
      if (r && verificado(r.estado)) continue;
      lacunas.push({ termoId: t.id, apelido: t.apelido, dia, estado: r?.estado ?? "NAO_VERIFICADO", ...(r?.erro ? { erro: r.erro } : {}) });
    }
  }
  lacunas.sort((a, b) => b.dia.localeCompare(a.dia) || a.apelido.localeCompare(b.apelido));
  return { rondaLigada: op.rondaLigada, intervaloHoras: op.intervaloHoras, termos: ativos.length, ultimaRonda, lacunas };
}

/** A ronda está atrasada quando passou mais que duas vezes o intervalo sem rodar. */
export function rondaAtrasada(r: Pick<ResumoCobertura, "ultimaRonda" | "intervaloHoras">, agora: Date): boolean {
  if (!r.ultimaRonda) return false;
  return agora.getTime() - Date.parse(r.ultimaRonda) > 2 * r.intervaloHoras * 3_600_000;
}

/** "há 5 min", "há 3 h", "há 2 dias". */
export function haQuantoTempo(iso: string, agora: Date): string {
  const min = Math.max(0, Math.round((agora.getTime() - Date.parse(iso)) / 60_000));
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

export interface Selo {
  tom: "ok" | "atencao" | "alerta" | "neutro";
  texto: string;
  /** Explicação mais longa, para o title e leitores de tela. */
  detalhe: string;
}

/** O que o Selo de Vigília diz. Nunca "tudo certo" sem uma ronda recente e sem lacunas. */
export function seloDeVigilia(r: ResumoCobertura, agora: Date): Selo {
  if (!r.termos) {
    return {
      tom: "neutro",
      texto: "Vigília sem termos",
      detalhe: "Nenhum cliente monitorado por OAB ou número de processo: a busca automática não tem o que procurar.",
    };
  }
  if (!r.rondaLigada) {
    return {
      tom: "atencao",
      texto: "Busca automática desligada",
      detalhe: "Este servidor não está rodando a busca automática. Nada novo será encontrado sozinho.",
    };
  }
  if (!r.ultimaRonda) {
    return { tom: "neutro", texto: "Vigília ativa · aguardando a primeira ronda", detalhe: "A busca automática ainda não rodou para os clientes monitorados." };
  }
  const ha = haQuantoTempo(r.ultimaRonda, agora);
  if (rondaAtrasada(r, agora)) {
    return {
      tom: "alerta",
      texto: `Vigília parada · última ronda ${ha}`,
      detalhe: `A busca automática deveria rodar a cada ${r.intervaloHoras} h e não roda desde ${ha.replace("há ", "")} atrás. Intimações novas podem não ter chegado.`,
    };
  }
  if (r.lacunas.length) {
    const dias = new Set(r.lacunas.map((l) => l.dia)).size;
    return {
      tom: "atencao",
      texto: `${dias} dia(s) sem verificação`,
      detalhe: `A última ronda foi ${ha}, mas ${dias} dia(s) não puderam ser verificados no Comunica. A busca tenta de novo sozinha; até lá, a lista pode estar incompleta.`,
    };
  }
  return { tom: "ok", texto: `Vigília ativa · última ronda ${ha}`, detalhe: `Todos os dias dos últimos ${DIAS_DE_VIGILIA} foram verificados no Comunica.` };
}
