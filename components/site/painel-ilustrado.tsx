"use client";

import { useEffect, useState } from "react";
import { ClepsaSimbolo } from "@/components/marca/clepsa-simbolo";

type Prazo = "Vencido" | "Hoje" | "Amanhã" | "2 dias" | "3 dias" | "5 dias" | "8 dias";
type Linha = { processo: string; tipo: string; prazo: Prazo };

// Tudo fictício: só mostra como a tela Hoje se mexe quando chegam intimações novas.
const CHEGADAS: Linha[] = [
  { processo: "0801234-56.2026.8.26.0100", tipo: "Intimação", prazo: "Hoje" },
  { processo: "5004321-11.2026.4.03.6100", tipo: "Citação", prazo: "Amanhã" },
  { processo: "1009876-22.2026.8.26.0224", tipo: "Decisão", prazo: "3 dias" },
  { processo: "0012345-67.2026.5.02.0011", tipo: "Despacho", prazo: "5 dias" },
  { processo: "0715502-08.2026.8.19.0001", tipo: "Sentença", prazo: "8 dias" },
  { processo: "1023344-90.2026.8.13.0024", tipo: "Intimação", prazo: "Vencido" },
  { processo: "5012876-45.2026.4.04.7000", tipo: "Citação", prazo: "2 dias" },
  { processo: "0020987-12.2026.5.15.0042", tipo: "Audiência", prazo: "Amanhã" },
  { processo: "0809911-37.2026.8.26.0577", tipo: "Intimação", prazo: "Hoje" },
  { processo: "1001765-03.2026.8.21.0001", tipo: "Decisão", prazo: "5 dias" },
];

// Contadores de cada momento da demonstração (vencidos, hoje, amanhã, novas).
const CONTAGENS = [
  [0, 1, 1, 6],
  [0, 2, 1, 7],
  [1, 2, 1, 8],
  [1, 2, 2, 9],
  [0, 3, 2, 10],
  [0, 2, 3, 11],
  [1, 3, 2, 12],
  [0, 2, 2, 13],
];

const TOM: Record<Prazo, string> = {
  Vencido: "bg-rose-500/25 text-rose-100 ring-rose-300/50",
  Hoje: "bg-rose-400/15 text-rose-200 ring-rose-300/30",
  Amanhã: "bg-amber-400/15 text-amber-200 ring-amber-300/30",
  "2 dias": "bg-brand-400/15 text-brand-200 ring-brand-300/30",
  "3 dias": "bg-brand-400/15 text-brand-200 ring-brand-300/30",
  "5 dias": "bg-brand-400/15 text-brand-200 ring-brand-300/30",
  "8 dias": "bg-brand-400/15 text-brand-200 ring-brand-300/30",
};

const CARTOES = [
  { rotulo: "Vencidos", cor: "text-emerald-300", corAlerta: "text-rose-300" },
  { rotulo: "Hoje", cor: "text-rose-300" },
  { rotulo: "Amanhã", cor: "text-amber-300" },
  { rotulo: "Novas", cor: "text-brand-300" },
];

const VISIVEIS = 4;
const INTERVALO_MS = 1600;

/**
 * Ilustração da tela Hoje na página inicial: a cada poucos segundos chega uma intimação nova
 * no topo da lista e os contadores mudam. Desenhada em HTML (nítida em qualquer tela).
 * Com movimento reduzido fica parada no primeiro quadro.
 */
export function PainelIlustrado() {
  const [passo, setPasso] = useState(0);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (!document.hidden) setPasso((p) => p + 1);
    }, INTERVALO_MS);
    return () => clearInterval(id);
  }, []);

  // A lista anda como uma fila: a mais nova entra no topo e a mais antiga sai embaixo.
  const linhas = Array.from({ length: VISIVEIS }, (_, i) => {
    const chegada = passo + VISIVEIS - 1 - i;
    return { ...CHEGADAS[chegada % CHEGADAS.length], chave: chegada, nova: i === 0 && passo > 0 };
  });
  const contagem = CONTAGENS[passo % CONTAGENS.length];

  return (
    <figure id="painel-inicio" className="relative">
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-brand-600/20 blur-3xl" aria-hidden />
      <div className="overflow-hidden rounded-2xl bg-[#0a1430]/90 shadow-[0_40px_80px_-40px_rgb(0_0_0/.9)] ring-1 ring-white/10 backdrop-blur" aria-hidden>
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium text-white">
            <ClepsaSimbolo className="h-5 w-5" /> Clepsa
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500/20 text-[11px] font-semibold text-brand-200">AL</span>
        </div>
        <div className="grid grid-cols-[120px_1fr] max-sm:grid-cols-1">
          <ul className="space-y-1 border-r border-white/5 p-3 text-[12px] text-slate-400 max-sm:hidden">
            {["Hoje", "Intimações", "Processos", "Clientes", "Equipe", "Relatórios"].map((item, i) => (
              <li key={item} className={i === 0 ? "rounded-md bg-brand-500/15 px-2 py-1.5 font-medium text-brand-200" : "px-2 py-1.5"}>
                {item}
              </li>
            ))}
          </ul>
          <div className="space-y-4 p-4">
            <p className="text-sm font-medium text-white">Hoje</p>
            <div className="grid grid-cols-4 gap-2">
              {CARTOES.map((c, i) => (
                <div key={c.rotulo} className="rounded-lg bg-white/[.03] p-2.5 ring-1 ring-inset ring-white/5">
                  <p className="truncate text-[10px] text-slate-400">{c.rotulo}</p>
                  <p key={`${c.rotulo}-${contagem[i]}`} className={`mt-1 animate-slide-in text-xl font-semibold tabular-nums ${i === 0 && contagem[i] > 0 ? c.corAlerta : c.cor}`}>
                    {contagem[i]}
                  </p>
                </div>
              ))}
            </div>
            <div className="overflow-hidden rounded-lg ring-1 ring-inset ring-white/5">
              {linhas.map((l) => (
                <div
                  key={l.chave}
                  className={`flex items-center gap-3 border-b border-white/5 px-3 py-2.5 text-[11px] transition-colors duration-1000 last:border-0 ${l.nova ? "animate-entrada-linha bg-brand-500/10" : ""}`}
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-slate-300">{l.processo}</span>
                  <span className="w-16 text-slate-400 max-sm:hidden">{l.tipo}</span>
                  <span className={`w-16 rounded-full px-2 py-0.5 text-center ring-1 ring-inset ${TOM[l.prazo]}`}>{l.prazo}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-right text-xs text-slate-500">Ilustração da tela Hoje. Os dados são fictícios.</figcaption>
    </figure>
  );
}
