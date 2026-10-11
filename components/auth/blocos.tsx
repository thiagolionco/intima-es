"use client";

import clsx from "clsx";
import { AlertCircle, CheckCircle2, Inbox, Info, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export function Cabecalho({ titulo, subtitulo, icone }: { titulo: string; subtitulo?: ReactNode; icone?: ReactNode }) {
  return (
    <div className="mb-8">
      {icone && <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">{icone}</div>}
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{titulo}</h1>
      {subtitulo && <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{subtitulo}</p>}
    </div>
  );
}

export function BotaoPrincipal({ carregando, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { carregando?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || carregando}
      className={clsx(
        "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-[15px] font-semibold text-white shadow-sm shadow-brand-900/20 transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {carregando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Aviso({ tom, children }: { tom: "erro" | "sucesso" | "info"; children: ReactNode }) {
  const estilos = {
    erro: ["border-red-200 bg-red-50 text-red-800", AlertCircle],
    sucesso: ["border-emerald-200 bg-emerald-50 text-emerald-800", CheckCircle2],
    info: ["border-blue-200 bg-blue-50 text-blue-900", Info],
  } as const;
  const [classe, Icone] = estilos[tom];
  return (
    <div className={clsx("mb-5 flex gap-2.5 rounded-xl border px-3.5 py-3 text-sm", classe)} role={tom === "erro" ? "alert" : "status"}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Rotulo({ htmlFor, children, extra }: { htmlFor: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {children}
      </label>
      {extra}
    </div>
  );
}

export function ErroCampo({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p className="mt-1.5 text-xs text-red-600" role="alert">
      {children}
    </p>
  );
}

/** Em desenvolvimento, atalho para ver os e-mails que "seriam enviados". */
export function LinkCaixaDeSaida({ className }: { className?: string }) {
  const [disponivel, setDisponivel] = useState(false);
  useEffect(() => {
    fetch("/api/dev/caixa-de-saida", { cache: "no-store" })
      .then((r) => r.json().then((j) => setDisponivel(r.ok && j.provedor === "console")))
      .catch(() => undefined);
  }, []);
  if (!disponivel) return null;
  return (
    <Link
      href="/dev/caixa-de-saida"
      target="_blank"
      className={clsx("flex items-center justify-center gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900 hover:bg-amber-100", className)}
    >
      <Inbox className="h-4 w-4" aria-hidden />
      Abrir caixa de saída (modo desenvolvimento)
    </Link>
  );
}

/** Contagem regressiva para botões de reenvio. */
export function useContagem(inicial = 0) {
  const [restante, setRestante] = useState(inicial);
  useEffect(() => {
    if (restante <= 0) return;
    const t = setTimeout(() => setRestante((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [restante]);
  return [restante, setRestante] as const;
}
