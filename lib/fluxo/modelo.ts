import type { FaseProcesso, Processo } from "../processos.ts";

/** Marcação de um item do checklist: quem marcou e quando. */
export interface MarcaItem {
  por: string;
  porNome: string;
  em: string;
}

/** Estado da Central para um processo. Só existe depois da primeira ação nele. */
export interface FluxoProcesso {
  processoId: string;
  /** Etapa a que `etapaDesde` se refere; se o processo mudou de fase por fora, ela fica para trás. */
  etapa: FaseProcesso;
  etapaDesde: string;
  /** Itens marcados (id do item → marca). Itens desmarcados não aparecem. */
  checklist: Record<string, MarcaItem>;
  /** Sobe a cada gravação; quem grava manda a versão que viu (controle de concorrência). */
  versao: number;
  atualizadoEm: string;
}

export type TipoEvento = "avanco" | "retorno" | "item_marcado" | "item_desmarcado";

/** Uma linha da trilha de auditoria. Só se acrescenta; nunca se altera nem apaga. */
export interface EventoFluxo {
  id: string;
  processoId: string;
  tipo: TipoEvento;
  de?: FaseProcesso;
  para?: FaseProcesso;
  item?: string;
  motivo?: string;
  autorId: string;
  autorNome: string;
  criadoEm: string;
}

export const LIMITES_FLUXO = { motivoMinimo: 10, motivo: 500, lote: 100, eventosNaFicha: 200 } as const;

/** Estado efetivo: sem registro, ou com registro de outra fase, a etapa conta desde a última alteração do processo. */
export function fluxoEfetivo(p: Processo, f: FluxoProcesso | undefined): FluxoProcesso {
  if (f && f.etapa === p.fase) return f;
  return {
    processoId: p.id,
    etapa: p.fase,
    etapaDesde: f && f.etapa !== p.fase ? p.atualizadoEm : (f?.etapaDesde ?? p.atualizadoEm),
    checklist: f?.checklist ?? {},
    versao: f?.versao ?? 0,
    atualizadoEm: f?.atualizadoEm ?? p.atualizadoEm,
  };
}
