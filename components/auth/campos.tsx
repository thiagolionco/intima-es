"use client";

import clsx from "clsx";
import { Check, Eye, EyeOff, Info, X } from "lucide-react";
import { forwardRef, useMemo, useRef, useState, type ClipboardEvent, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { avaliarSenha } from "@/lib/auth/politica-senha";

const baseCampo =
  "block w-full rounded-xl border-0 bg-white px-3.5 py-3 text-[15px] text-slate-900 shadow-sm ring-1 ring-inset placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-600 disabled:bg-slate-50";

export const CampoTexto = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean }>(function CampoTexto({ className, invalido, ...rest }, ref) {
  return <input ref={ref} className={clsx(baseCampo, invalido ? "ring-red-400" : "ring-slate-300", className)} aria-invalid={invalido || undefined} {...rest} />;
});

/** Campo de senha com mostrar/ocultar e aviso de Caps Lock ligado. */
export const CampoSenha = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean }>(function CampoSenha({ className, invalido, onKeyUp, ...rest }, ref) {
  const [visivel, setVisivel] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  return (
    <div>
      <div className="relative">
        <input
          ref={ref}
          type={visivel ? "text" : "password"}
          className={clsx(baseCampo, "pr-11", invalido ? "ring-red-400" : "ring-slate-300", className)}
          aria-invalid={invalido || undefined}
          onKeyUp={(e) => {
            setCapsLock(e.getModifierState?.("CapsLock") ?? false);
            onKeyUp?.(e);
          }}
          spellCheck={false}
          autoCapitalize="off"
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-400 hover:text-slate-600"
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visivel}
          tabIndex={-1}
        >
          {visivel ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {capsLock && (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-amber-700" role="status">
          <Info className="h-3.5 w-3.5" /> Caps Lock está ativado
        </p>
      )}
    </div>
  );
});

const CORES = ["bg-red-500", "bg-orange-500", "bg-amber-400", "bg-emerald-500", "bg-emerald-600"];

/** Medidor de força + checklist de requisitos, usando a mesma política do servidor. */
export function MedidorSenha({ senha, email, nome }: { senha: string; email?: string; nome?: string }) {
  const av = useMemo(() => avaliarSenha(senha, { email, nome }), [senha, email, nome]);
  return (
    <div className="mt-3 space-y-3" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="grid flex-1 grid-cols-4 gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={clsx("h-1.5 rounded-full transition-colors", senha && av.pontuacao >= n ? CORES[av.pontuacao] : "bg-slate-200")} />
          ))}
        </div>
        <span className={clsx("w-20 text-right text-xs font-medium", av.valida ? "text-emerald-700" : "text-slate-500")}>{av.rotulo || "—"}</span>
      </div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {av.requisitos.map((r) => (
          <li key={r.id} className={clsx("flex items-center gap-1.5 text-xs", r.ok ? "text-emerald-700" : "text-slate-500")}>
            {r.ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
            {r.rotulo}
            {r.id === "simbolo" && <span className="text-slate-400">(recomendado)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Entrada de código de 6 dígitos em caixas separadas, com colar e avanço automático. */
export function CodigoVerificacao({ valor, onChange, onCompleto, desabilitado, invalido }: { valor: string; onChange: (v: string) => void; onCompleto?: (v: string) => void; desabilitado?: boolean; invalido?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digitos = valor.padEnd(6, " ").slice(0, 6).split("");

  function definir(novo: string) {
    const limpo = novo.replace(/\D/g, "").slice(0, 6);
    onChange(limpo);
    if (limpo.length === 6) onCompleto?.(limpo);
    return limpo;
  }

  function aoDigitar(i: number, ch: string) {
    const d = ch.replace(/\D/g, "").slice(-1);
    if (!d) return;
    const arr = valor.padEnd(6, " ").slice(0, 6).split("");
    arr[i] = d;
    const novo = definir(arr.join("").replace(/\s/g, ""));
    refs.current[Math.min(novo.length, 5)]?.focus();
  }

  function aoTeclar(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const arr = valor.split("");
      if (arr[i] !== undefined) arr.splice(i, 1);
      else if (i > 0) arr.splice(i - 1, 1);
      definir(arr.join(""));
      refs.current[Math.max(0, i - (valor[i] ? 0 : 1))]?.focus();
    }
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
  }

  function aoColar(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const novo = definir(e.clipboardData.getData("text"));
    refs.current[Math.min(novo.length, 5)]?.focus();
  }

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="Código de verificação de 6 dígitos">
      {digitos.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d.trim()}
          onChange={(e) => aoDigitar(i, e.target.value)}
          onKeyDown={(e) => aoTeclar(i, e)}
          onPaste={aoColar}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={desabilitado}
          autoFocus={i === 0}
          aria-label={`Dígito ${i + 1}`}
          className={clsx(
            "h-14 w-full min-w-0 rounded-xl border-0 bg-white text-center font-mono text-2xl font-semibold text-slate-900 shadow-sm ring-1 ring-inset transition focus:ring-2 focus:ring-brand-600",
            invalido ? "ring-red-400" : "ring-slate-300",
            i === 2 && "mr-2",
          )}
        />
      ))}
    </div>
  );
}
