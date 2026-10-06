"use client";

import { useState } from "react";

export interface Ponto {
  rotulo: string;
  valor: number;
  cor?: string;
}

export const PALETA = ["#2147ed", "#0ea5e9", "#14b8a6", "#f59e0b", "#e11d48", "#8b5cf6", "#64748b"];

/** Gráfico de colunas simples (ex.: intimações por mês). */
export function ColumnChart({ dados, altura = 200 }: { dados: Ponto[]; altura?: number }) {
  const [foco, setFoco] = useState<number | null>(null);
  const max = Math.max(1, ...dados.map((d) => d.valor));
  const passo = max <= 4 ? 1 : Math.ceil(max / 4);
  const topo = passo * Math.ceil(max / passo);
  const linhas = Array.from({ length: topo / passo + 1 }, (_, i) => i * passo);

  return (
    <div className="flex gap-2" style={{ height: altura }}>
      <div className="flex flex-col-reverse justify-between pb-6 text-right text-[11px] text-slate-400">
        {linhas.map((l) => (
          <span key={l} className="leading-none">
            {l}
          </span>
        ))}
      </div>
      <div className="relative flex flex-1 flex-col">
        <div className="absolute inset-x-0 bottom-6 top-0 flex flex-col-reverse justify-between">
          {linhas.map((l) => (
            <div key={l} className="border-t border-dashed border-slate-200" />
          ))}
        </div>
        <div className="relative flex flex-1 items-end gap-2 sm:gap-3">
          {dados.map((d, i) => (
            <div
              key={d.rotulo}
              className="group relative flex h-full flex-1 items-end justify-center"
              onMouseEnter={() => setFoco(i)}
              onMouseLeave={() => setFoco(null)}
            >
              {foco === i && (
                <div className="absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow">
                  {d.rotulo}: <strong>{d.valor}</strong>
                </div>
              )}
              <div
                className="w-full max-w-[40px] rounded-t-md transition-all"
                style={{ height: `${(d.valor / topo) * 100}%`, background: d.cor ?? PALETA[0], opacity: foco === null || foco === i ? 1 : 0.55, minHeight: d.valor ? 3 : 0 }}
                role="img"
                aria-label={`${d.rotulo}: ${d.valor}`}
              />
            </div>
          ))}
        </div>
        <div className="flex h-6 gap-2 pt-1.5 sm:gap-3">
          {dados.map((d) => (
            <span key={d.rotulo} className="flex-1 truncate text-center text-[11px] text-slate-500">
              {d.rotulo}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Gráfico de rosca com legenda (ex.: por tipo de comunicação ou status). */
export function DonutChart({ dados, centro }: { dados: Ponto[]; centro?: string }) {
  const total = dados.reduce((s, d) => s + d.valor, 0);
  const r = 15.9155; // circunferência = 100
  let acumulado = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
      <svg viewBox="0 0 42 42" className="h-28 w-28 shrink-0 -rotate-90" role="img" aria-label="Distribuição">
        <circle cx="21" cy="21" r={r} fill="none" stroke="#f1f5f9" strokeWidth="5" />
        {total > 0 &&
          dados.map((d, i) => {
            const pct = (d.valor / total) * 100;
            const el = (
              <circle
                key={d.rotulo}
                cx="21"
                cy="21"
                r={r}
                fill="none"
                stroke={d.cor ?? PALETA[i % PALETA.length]}
                strokeWidth="5"
                strokeDasharray={`${pct} ${100 - pct}`}
                strokeDashoffset={-acumulado}
              >
                <title>{`${d.rotulo}: ${d.valor}`}</title>
              </circle>
            );
            acumulado += pct;
            return el;
          })}
        <text x="21" y="21" textAnchor="middle" dominantBaseline="central" className="fill-slate-900 text-[7px] font-semibold" transform="rotate(90 21 21)">
          {centro ?? total}
        </text>
      </svg>
      <ul className="w-full min-w-0 flex-1 space-y-1.5">
        {dados.map((d, i) => (
          <li key={d.rotulo} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.cor ?? PALETA[i % PALETA.length] }} />
            <span className="flex-1 truncate text-slate-600">{d.rotulo}</span>
            <span className="font-medium tabular-nums text-slate-900">{d.valor}</span>
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-slate-400">{total ? Math.round((d.valor / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barras horizontais ranqueadas (ex.: por cliente ou tribunal). */
export function BarList({ dados, cor = PALETA[0] }: { dados: Ponto[]; cor?: string }) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  return (
    <ul className="space-y-3">
      {dados.map((d) => (
        <li key={d.rotulo}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate text-slate-600">{d.rotulo}</span>
            <span className="font-medium tabular-nums text-slate-900">{d.valor}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full transition-all" style={{ width: `${(d.valor / max) * 100}%`, background: d.cor ?? cor }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
