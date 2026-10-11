import type { Intimacao, ResumoIntimacao } from "../../lib/types.ts";
import type { Clock } from "../core/clock.ts";
import { AppError } from "../core/errors.ts";
import type { EspacoTrabalhoRepository } from "../workspace/espaco-trabalho.ts";
import type { Resumidor } from "./resumidor.ts";

/** Quantas intimações um pedido resume no máximo. */
export const MAXIMO_POR_PEDIDO = 20;
/** Quantos resumos são pedidos ao mesmo tempo. */
const SIMULTANEOS = 3;

export interface DepsResumos {
  espacos: EspacoTrabalhoRepository;
  /** Ausente quando não há chave configurada: o serviço fica indisponível e nada é enviado. */
  resumidor?: Resumidor;
  clock: Clock;
}

export interface ResultadoResumos {
  resumos: Record<string, ResumoIntimacao>;
  falhas: number;
}

const precisaDeResumo = (i: Intimacao) => !i.resumo && (i.texto ?? "").trim().length > 0;

/** Gera e grava os resumos em duas linhas das intimações de uma conta. */
export class ResumosService {
  private readonly d: DepsResumos;

  constructor(deps: DepsResumos) {
    this.d = deps;
  }

  get disponivel(): boolean {
    return !!this.d.resumidor;
  }

  /**
   * Resume as intimações pedidas (ou, sem `ids`, as mais recentes sem resumo), até `limite`.
   * Os resumos são pedidos fora da gravação, que depois tenta de novo se outra escrita chegou antes.
   */
  async resumir(usuarioId: string, ids?: string[], limite = MAXIMO_POR_PEDIDO): Promise<ResultadoResumos> {
    const resumidor = this.d.resumidor;
    if (!resumidor) throw new AppError("indisponivel", "O resumo automático não está ligado neste servidor.");

    const espaco = await this.d.espacos.ler(usuarioId);
    const pedidos = ids ? new Set(ids) : null;
    const alvos = espaco.intimacoes
      .filter((i) => (pedidos ? pedidos.has(i.id) : true) && precisaDeResumo(i))
      .sort((a, b) => b.dataDisponibilizacao.localeCompare(a.dataDisponibilizacao))
      .slice(0, limite);
    if (!alvos.length) return { resumos: {}, falhas: 0 };

    const gerados = new Map<string, { texto: string; de: string }>();
    let falhas = 0;
    for (let k = 0; k < alvos.length; k += SIMULTANEOS) {
      await Promise.all(
        alvos.slice(k, k + SIMULTANEOS).map(async (i) => {
          try {
            gerados.set(i.id, { texto: await resumidor.resumir(i), de: i.texto });
          } catch (e) {
            falhas++;
            console.error(`[resumos] falha ao resumir ${i.id}:`, e instanceof Error ? e.message : e);
          }
        }),
      );
    }
    if (!gerados.size) return { resumos: {}, falhas };

    const em = this.d.clock.agora().toISOString();
    for (let tentativa = 0; ; tentativa++) {
      const atual = tentativa === 0 ? espaco : await this.d.espacos.ler(usuarioId);
      const resumos: Record<string, ResumoIntimacao> = {};
      const intimacoes = atual.intimacoes.map((i) => {
        const g = gerados.get(i.id);
        // Se o texto mudou enquanto o resumo era gerado, ele já não vale.
        if (!g || i.resumo || i.texto !== g.de) return i;
        resumos[i.id] = { texto: g.texto, em };
        return { ...i, resumo: resumos[i.id] };
      });
      if (!Object.keys(resumos).length) return { resumos, falhas };
      try {
        await this.d.espacos.salvar(usuarioId, { intimacoes, termos: atual.termos }, atual.revisao);
        return { resumos, falhas };
      } catch (e) {
        if (e instanceof AppError && e.codigo === "conflito" && tentativa < 4) continue;
        throw e;
      }
    }
  }
}
