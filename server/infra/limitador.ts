import type { LimitadorDeTaxa } from "../auth/ports.ts";
import type { Clock } from "../core/clock.ts";
import { AppError } from "../core/errors.ts";

/**
 * Janela deslizante em memória. Suficiente para uma instância; para várias instâncias,
 * implemente LimitadorDeTaxa com Redis e registre no container.
 */
export class LimitadorEmMemoria implements LimitadorDeTaxa {
  private readonly registros = new Map<string, number[]>();
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  consumir(chave: string, limite: number, janelaMs: number): void {
    const agora = this.clock.agora().getTime();
    const recentes = (this.registros.get(chave) ?? []).filter((t) => agora - t < janelaMs);
    if (recentes.length >= limite) {
      const segundos = Math.ceil((janelaMs - (agora - recentes[0])) / 1000);
      this.registros.set(chave, recentes);
      throw new AppError("muitas_tentativas", `Muitas tentativas. Aguarde ${formatarEspera(segundos)} e tente novamente.`, { aguardarSegundos: segundos });
    }
    recentes.push(agora);
    this.registros.set(chave, recentes);
    if (this.registros.size > 10_000) this.limpar(agora, janelaMs);
  }

  zerar(chave: string): void {
    this.registros.delete(chave);
  }

  private limpar(agora: number, janelaMs: number) {
    for (const [k, v] of this.registros) if (!v.some((t) => agora - t < janelaMs)) this.registros.delete(k);
  }
}

function formatarEspera(segundos: number): string {
  if (segundos < 60) return `${segundos} segundo${segundos === 1 ? "" : "s"}`;
  const min = Math.ceil(segundos / 60);
  return `${min} minuto${min === 1 ? "" : "s"}`;
}
