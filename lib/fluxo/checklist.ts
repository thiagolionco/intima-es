import type { FaseProcesso, Processo } from "../processos.ts";
import { etapa, type ModeloItem } from "./etapas.ts";
import type { FluxoProcesso, MarcaItem } from "./modelo.ts";

export interface ItemAvaliado extends ModeloItem {
  feito: boolean;
  marca?: MarcaItem;
}

/** Itens da etapa com o que já está feito (marcado à mão ou conferido nos dados). */
export function itensDaEtapa(p: Processo, fluxo: Pick<FluxoProcesso, "checklist">, id: FaseProcesso = p.fase): ItemAvaliado[] {
  return etapa(id).checklist.map((item) => {
    const marca = fluxo.checklist[item.id];
    const feito = item.automatico ? item.automatico(p) : Boolean(marca);
    return { ...item, feito, marca: item.automatico ? undefined : marca };
  });
}

export function progresso(itens: ItemAvaliado[]): { feitos: number; total: number } {
  return { feitos: itens.filter((i) => i.feito).length, total: itens.length };
}

export const pendenciasBloqueantes = (itens: ItemAvaliado[]) => itens.filter((i) => i.bloqueante && !i.feito);
