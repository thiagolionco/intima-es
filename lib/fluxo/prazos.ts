import type { FaseProcesso } from "../processos.ts";
import { etapa } from "./etapas.ts";

export type SituacaoPrazo = "no_prazo" | "atencao" | "estourado" | "sem_prazo";

/** Dias inteiros desde `desde` (ISO com hora) até `agora`. */
export function diasDesde(desde: string, agora: Date): number {
  const t = Date.parse(desde);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((agora.getTime() - t) / 86_400_000));
}

/** Passou do prazo é estourado; a partir de 70% dele merece atenção. */
export function situacaoPrazo(id: FaseProcesso, dias: number): SituacaoPrazo {
  const prazo = etapa(id).prazoDias;
  if (!prazo) return "sem_prazo";
  if (dias > prazo) return "estourado";
  if (dias >= Math.ceil(prazo * 0.7)) return "atencao";
  return "no_prazo";
}
