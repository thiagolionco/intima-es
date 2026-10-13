"use client";

import clsx from "clsx";
import { AlertTriangle, CircleSlash, Eye, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type ResumoCobertura, seloDeVigilia } from "@/lib/cobertura";
import { dataBR } from "@/lib/prazos/datas";

/** Relógio que anda de minuto em minuto, para o "há X min" não congelar. */
function useAgora() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return agora;
}

const ICONES = { ok: Eye, atencao: AlertTriangle, alerta: ShieldAlert, neutro: CircleSlash };

/** Selo de Vigília da barra lateral: ícone, texto e cor (nunca só cor). */
export function SeloVigilia({ cobertura, escuro }: { cobertura?: ResumoCobertura; escuro?: boolean }) {
  const agora = useAgora();
  if (!cobertura) return null;
  const s = seloDeVigilia(cobertura, agora);
  const Icone = ICONES[s.tom];
  const cor = {
    ok: escuro ? "text-emerald-400" : "text-emerald-700",
    atencao: escuro ? "text-amber-300" : "text-amber-800",
    alerta: escuro ? "text-red-300" : "text-red-700",
    neutro: escuro ? "text-slate-400" : "text-slate-500",
  }[s.tom];
  return (
    <Link
      href="/clientes"
      className={clsx("inline-flex items-start gap-1.5 text-[11px] leading-snug hover:underline", cor)}
      title={s.detalhe}
      role="status"
      aria-live="polite"
    >
      <Icone className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {s.texto}
        <span className="sr-only">. {s.detalhe}</span>
      </span>
    </Link>
  );
}

/**
 * Faixa nas telas que mostram listas: avisa que "nenhuma intimação" pode não ser verdade porque
 * algum dia não foi verificado, ou porque a vigília parou.
 */
export function FaixaCobertura({ cobertura }: { cobertura?: ResumoCobertura }) {
  const agora = useAgora();
  if (!cobertura) return null;
  const s = seloDeVigilia(cobertura, agora);
  if (s.tom !== "atencao" && s.tom !== "alerta") return null;
  const dias = [...new Set(cobertura.lacunas.map((l) => l.dia))];
  return (
    <div
      className={clsx(
        "mb-5 flex gap-3 rounded-xl border px-4 py-3 text-sm",
        s.tom === "alerta" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900",
      )}
      role="status"
    >
      {s.tom === "alerta" ? <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />}
      <div className="min-w-0">
        <p className="font-semibold">{s.texto}</p>
        <p className="mt-0.5">{s.detalhe}</p>
        {dias.length > 0 && (
          <p className="mt-1 text-xs">
            Dias sem verificação: {dias.slice(0, 6).map(dataBR).join(", ")}
            {dias.length > 6 && ` e mais ${dias.length - 6}`}.{" "}
            <Link href="/clientes" className="font-medium underline">
              Ver por cliente
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
