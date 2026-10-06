"use client";

import clsx from "clsx";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { hojeISO, MESES, parseISODate, toISODate } from "@/lib/utils";

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

function isoParaBR(iso: string): string {
  const d = parseISODate(iso);
  return d ? d.toLocaleDateString("pt-BR") : "";
}

function brParaISO(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return parseISODate(iso) ? iso : null;
}

/** Aplica a máscara dd/mm/aaaa enquanto o usuário digita. */
function mascara(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  invalid?: boolean;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function DatePicker({ id, value, onChange, min, max, invalid, placeholder = "dd/mm/aaaa", clearable = true, className, ...aria }: DatePickerProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(isoParaBR(value));
  const base = parseISODate(value) ?? new Date();
  const [mes, setMes] = useState({ ano: base.getFullYear(), mes: base.getMonth() });
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTexto(isoParaBR(value));
    const d = parseISODate(value);
    if (d) setMes({ ano: d.getFullYear(), mes: d.getMonth() });
  }, [value]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const foraDoIntervalo = (iso: string) => (min && iso < min) || (max && iso > max);

  function selecionar(iso: string) {
    if (foraDoIntervalo(iso)) return;
    onChange(iso);
    setAberto(false);
  }

  function aoDigitar(v: string) {
    const m = mascara(v);
    setTexto(m);
    if (m === "") onChange("");
    const iso = brParaISO(m);
    if (iso) onChange(iso);
  }

  const primeiroDia = new Date(mes.ano, mes.mes, 1);
  const diasNoMes = new Date(mes.ano, mes.mes + 1, 0).getDate();
  const celulas: (string | null)[] = [
    ...Array.from({ length: primeiroDia.getDay() }, () => null),
    ...Array.from({ length: diasNoMes }, (_, i) => toISODate(new Date(mes.ano, mes.mes, i + 1))),
  ];
  const hoje = hojeISO();

  function mudarMes(delta: number) {
    setMes((m) => {
      const d = new Date(m.ano, m.mes + delta, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() };
    });
  }

  return (
    <div ref={raiz} className={clsx("relative", className)}>
      <div
        className={clsx(
          "flex items-center rounded-lg bg-white shadow-sm ring-1 ring-inset focus-within:ring-2 focus-within:ring-brand-600",
          invalid ? "ring-red-400" : "ring-slate-300",
        )}
      >
        <input
          id={inputId}
          inputMode="numeric"
          autoComplete="off"
          value={texto}
          placeholder={placeholder}
          onChange={(e) => aoDigitar(e.target.value)}
          onBlur={() => setTexto(isoParaBR(value))}
          onFocus={() => setAberto(true)}
          aria-invalid={invalid || undefined}
          aria-label={aria["aria-label"]}
          className="w-full min-w-0 rounded-lg border-0 bg-transparent px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-0"
        />
        {clearable && value && (
          <button type="button" onClick={() => onChange("")} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Limpar data">
            <X className="h-4 w-4" />
          </button>
        )}
        <button type="button" onClick={() => setAberto((a) => !a)} className="mr-1 rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Abrir calendário">
          <CalendarDays className="h-4 w-4" />
        </button>
      </div>

      {aberto && (
        <div className="absolute left-0 z-40 mt-2 w-72 animate-fade-in rounded-xl border border-slate-200 bg-white p-3 shadow-lg" role="dialog" aria-label="Calendário">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => mudarMes(-1)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-slate-800">
              {MESES[mes.mes]} {mes.ano}
            </span>
            <button type="button" onClick={() => mudarMes(1)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Próximo mês">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
            {DIAS_SEMANA.map((d, i) => (
              <div key={i} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celulas.map((iso, i) =>
              iso ? (
                <button
                  type="button"
                  key={iso}
                  disabled={!!foraDoIntervalo(iso)}
                  onClick={() => selecionar(iso)}
                  className={clsx(
                    "h-8 rounded-md text-sm transition disabled:cursor-not-allowed disabled:text-slate-300",
                    iso === value
                      ? "bg-brand-600 font-semibold text-white"
                      : iso === hoje
                        ? "font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-50"
                        : "text-slate-700 hover:bg-slate-100",
                  )}
                >
                  {Number(iso.slice(8))}
                </button>
              ) : (
                <div key={`v${i}`} />
              ),
            )}
          </div>
          <div className="mt-2 flex justify-between border-t border-slate-100 pt-2">
            <button type="button" onClick={() => selecionar(hoje)} className="text-xs font-medium text-brand-700 hover:underline">
              Hoje
            </button>
            {clearable && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setAberto(false);
                }}
                className="text-xs font-medium text-slate-500 hover:underline"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
