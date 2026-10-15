"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import type { SituacaoPrazo } from "@/lib/fluxo/prazos";
import { etapa } from "@/lib/fluxo/etapas";
import type { FaseProcesso } from "@/lib/processos";

/** Cor de cada etapa, a mesma na esteira, na grade e na ficha. */
export const COR_ETAPA: Record<FaseProcesso, { fundo: string; texto: string; suave: string; ponto: string }> = {
  triagem: { fundo: "bg-slate-700", texto: "text-slate-200", suave: "bg-slate-100 text-slate-700", ponto: "bg-slate-600" },
  elaboracao: { fundo: "bg-brand-700", texto: "text-brand-100", suave: "bg-brand-50 text-brand-700", ponto: "bg-brand-600" },
  correcao: { fundo: "bg-violet-700", texto: "text-violet-100", suave: "bg-violet-50 text-violet-700", ponto: "bg-violet-600" },
  protocolado: { fundo: "bg-emerald-700", texto: "text-emerald-100", suave: "bg-emerald-50 text-emerald-700", ponto: "bg-emerald-600" },
};

export function Kbd({ children, escuro }: { children: ReactNode; escuro?: boolean }) {
  return (
    <kbd className={clsx("inline-flex min-w-[1.25rem] items-center justify-center rounded border border-b-2 px-1 font-mono text-[10px] leading-4", escuro ? "border-slate-600 text-slate-300" : "border-slate-300 bg-white text-slate-500")}>
      {children}
    </kbd>
  );
}

export function SiglaEtapa({ fase, className }: { fase: FaseProcesso; className?: string }) {
  return <span className={clsx("rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white", COR_ETAPA[fase].fundo, className)}>{etapa(fase).sigla}</span>;
}

export function Progresso({ feitos, total, className }: { feitos: number; total: number; className?: string }) {
  const pct = total ? Math.round((feitos / total) * 100) : 0;
  return (
    <span className={clsx("flex items-center gap-1.5", className)} title={`${feitos} de ${total} itens do checklist`}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100">
        <span className={clsx("block h-full rounded-full", feitos === total ? "bg-emerald-500" : "bg-brand-600")} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs tabular-nums text-slate-500">
        {feitos}/{total}
      </span>
    </span>
  );
}

const TOM_PRAZO: Record<SituacaoPrazo, { texto: string; barra: string }> = {
  estourado: { texto: "font-semibold text-red-700", barra: "bg-red-500" },
  atencao: { texto: "font-medium text-amber-700", barra: "bg-amber-500" },
  no_prazo: { texto: "text-slate-600", barra: "bg-slate-300" },
  sem_prazo: { texto: "text-slate-500", barra: "bg-slate-200" },
};

/** "7 de 5 dias" com a barrinha do quanto do prazo já foi. */
export function TempoNaEtapa({ dias, prazoDias, situacao }: { dias: number; prazoDias?: number; situacao: SituacaoPrazo }) {
  const tom = TOM_PRAZO[situacao];
  const texto = prazoDias ? `${dias} de ${prazoDias} dia${prazoDias === 1 ? "" : "s"}` : `${dias} dia${dias === 1 ? "" : "s"}`;
  return (
    <span className="block" title={situacao === "estourado" ? "Prazo da etapa estourado" : undefined}>
      <span className={clsx("block text-xs tabular-nums", tom.texto)}>{texto}</span>
      {prazoDias && (
        <span className="mt-1 block h-1 w-20 overflow-hidden rounded-full bg-slate-100">
          <span className={clsx("block h-full rounded-full", tom.barra)} style={{ width: `${Math.min(100, (dias / prazoDias) * 100)}%` }} />
        </span>
      )}
    </span>
  );
}

/** Dias até prescrever em linguagem curta: "24 dias", "1 ano", "vencida". */
export function textoCurtoPrescricao(dias: number): string {
  if (dias < 0) return `vencida há ${-dias}d`;
  if (dias === 0) return "hoje";
  if (dias < 365) return `${dias} dia${dias === 1 ? "" : "s"}`;
  const anos = Math.floor(dias / 365);
  return `${anos} ano${anos === 1 ? "" : "s"}`;
}

export function CelulaPrescricao({ dias }: { dias?: number }) {
  if (dias === undefined) return <span className="text-xs text-slate-400">—</span>;
  const tom = dias <= 30 ? "bg-red-50 text-red-700 font-medium" : dias <= 90 ? "bg-amber-50 text-amber-800 font-medium" : "text-slate-500";
  return <span className={clsx("rounded-md px-1.5 py-0.5 text-xs tabular-nums", tom)}>{textoCurtoPrescricao(dias)}</span>;
}
