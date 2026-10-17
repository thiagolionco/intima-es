"use client";

import clsx from "clsx";
import type { resumoDaEsteira } from "@/lib/fluxo/consulta";
import type { FaseProcesso } from "@/lib/processos";
import { COR_ETAPA } from "./selos";

const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Os números de cada etapa numa faixa só; clicar filtra a grade pela etapa. */
export function Esteira({ resumo, ativa, onEscolher }: { resumo: ReturnType<typeof resumoDaEsteira>; ativa?: FaseProcesso; onEscolher: (f: FaseProcesso) => void }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-1 md:flex" role="group" aria-label="Esteira de etapas">
      {resumo.map(({ etapa, total, mediaDias, estourados, prontos }, i) => {
        const cor = COR_ETAPA[etapa.id];
        return (
          <button
            key={etapa.id}
            type="button"
            onClick={() => onEscolher(etapa.id)}
            aria-pressed={ativa === etapa.id}
            className={clsx(
              "relative flex-1 py-2.5 text-left text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
              cor.fundo,
              "rounded-lg md:rounded-none",
              i === 0 ? "md:rounded-l-lg md:pl-4 md:pr-7 md:[clip-path:polygon(0_0,calc(100%_-_14px)_0,100%_50%,calc(100%_-_14px)_100%,0_100%)]" : "md:pl-7 md:pr-7 md:[clip-path:polygon(0_0,calc(100%_-_14px)_0,100%_50%,calc(100%_-_14px)_100%,0_100%,14px_50%)]",
              "px-3",
              ativa === etapa.id && "ring-2 ring-inset ring-white/60",
            )}
          >
            <span className="flex items-baseline gap-2">
              <span className={clsx("truncate text-[11px] font-medium uppercase tracking-wider", cor.texto)}>{etapa.rotulo}</span>
              <span className="text-lg font-semibold tabular-nums">{total}</span>
            </span>
            <span className={clsx("block truncate text-[11px]", cor.texto)}>
              {etapa.prazoDias ? (
                <>
                  média {fmt(mediaDias)} d · prazo {etapa.prazoDias}
                  {estourados > 0 && <span className="font-semibold text-red-200"> · {estourados} estourado{estourados > 1 ? "s" : ""}</span>}
                  {prontos > 0 && <span className="font-semibold text-emerald-200"> · {prontos} pronto{prontos > 1 ? "s" : ""}</span>}
                </>
              ) : (
                "fim da esteira"
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
