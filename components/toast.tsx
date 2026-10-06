"use client";

import clsx from "clsx";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Tom = "success" | "error" | "info";
interface Toast {
  id: number;
  tom: Tom;
  titulo: string;
  descricao?: string;
}

interface ToastApi {
  toast: (titulo: string, opts?: { tom?: Tom; descricao?: string }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remover = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback<ToastApi["toast"]>(
    (titulo, opts) => {
      const id = ++seq;
      setToasts((t) => [...t.slice(-3), { id, titulo, tom: opts?.tom ?? "success", descricao: opts?.descricao }]);
      setTimeout(() => remover(id), opts?.tom === "error" ? 7000 : 4000);
    },
    [remover],
  );

  const api = useMemo(() => ({ toast }), [toast]);
  const icones = { success: CheckCircle2, error: AlertCircle, info: Info };
  const cores = { success: "text-emerald-600", error: "text-red-600", info: "text-brand-600" };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end">
        {toasts.map((t) => {
          const Icone = icones[t.tom];
          return (
            <div key={t.id} className="pointer-events-auto flex w-full max-w-sm animate-slide-in items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
              <Icone className={clsx("mt-0.5 h-5 w-5 shrink-0", cores[t.tom])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{t.titulo}</p>
                {t.descricao && <p className="mt-0.5 text-sm text-slate-500">{t.descricao}</p>}
              </div>
              <button onClick={() => remover(t.id)} className="rounded p-0.5 text-slate-400 hover:text-slate-600" aria-label="Fechar aviso">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de <ToastProvider>.");
  return ctx;
}
