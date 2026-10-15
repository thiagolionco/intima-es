import type { FaseProcesso, Processo } from "../processos.ts";
import { etapaAnterior, proximaEtapa } from "./etapas.ts";
import type { FluxoProcesso } from "./modelo.ts";
import { type Achado, type ContextoTransicao, REGRAS_PADRAO, type Regra } from "./regras.ts";

export interface Avaliacao {
  permitido: boolean;
  bloqueios: Achado[];
  avisos: Achado[];
}

/**
 * Avalia uma mudança de etapa passando por todas as regras. O mesmo motor roda na tela (para
 * mostrar os portões) e no servidor (que é quem decide).
 */
export class MotorDeFluxo {
  private readonly regras: readonly Regra[];
  constructor(regras: readonly Regra[] = REGRAS_PADRAO) {
    this.regras = regras;
  }

  avaliar(ctx: ContextoTransicao): Avaliacao {
    const achados = this.regras.flatMap((r) => r.avaliar(ctx));
    const bloqueios = achados.filter((a) => a.severidade === "bloqueio");
    return { permitido: bloqueios.length === 0, bloqueios, avisos: achados.filter((a) => a.severidade === "aviso") };
  }

  /** Atalho para o próximo passo; `undefined` quando já é a última etapa. */
  avaliarAvanco(processo: Processo, fluxo: FluxoProcesso, hoje: string): (Avaliacao & { para: FaseProcesso }) | undefined {
    const para = proximaEtapa(processo.fase);
    return para ? { para, ...this.avaliar({ processo, fluxo, para, hoje }) } : undefined;
  }

  anterior(processo: Processo): FaseProcesso | undefined {
    return etapaAnterior(processo.fase);
  }
}

export const motorPadrao = new MotorDeFluxo();
