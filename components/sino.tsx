"use client";

import clsx from "clsx";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { notificacoes } from "@/lib/notificacoes";
import { useStore } from "@/lib/store";
import { useCobertura } from "@/lib/use-cobertura";
import { hojeISO } from "@/lib/utils";

const COR = { alerta: "bg-red-500", atencao: "bg-amber-400", info: "bg-brand-400" };
const TEXTO_TOM = { alerta: "Urgente", atencao: "Atenção", info: "Aviso" };

/** Sino da barra lateral: junta vigília parada, prazos e intimações novas num só lugar. */
export function Sino() {
  const { intimacoes, ready } = useStore();
  const { cobertura } = useCobertura();
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const lista = useMemo(() => (ready ? notificacoes(intimacoes, cobertura, hojeISO(), new Date()) : []), [ready, intimacoes, cobertura]);
  const urgentes = lista.filter((n) => n.tom !== "info").length;

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => raiz.current && !raiz.current.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div className="relative" ref={raiz}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="relative rounded-md p-2 text-slate-300 hover:bg-white/10"
        aria-label={lista.length ? `Notificações: ${lista.length}` : "Notificações: nenhuma"}
        aria-expanded={aberto}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {lista.length > 0 && (
          <span className={clsx("absolute right-0.5 top-0.5 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold leading-4 text-white", urgentes ? "bg-red-500" : "bg-brand-500")}>
            {lista.length}
          </span>
        )}
      </button>
      {aberto && (
        <div className="fixed inset-x-4 top-14 z-50 lg:absolute lg:inset-x-auto lg:left-0 lg:top-full lg:mt-2 lg:w-72 rounded-xl border border-slate-200 bg-white text-slate-800 shadow-lg" role="dialog" aria-label="Notificações">
          {lista.length === 0 ? (
            <p className="px-4 py-5 text-sm text-slate-500">Nada pedindo atenção agora.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lista.map((n) => (
                <li key={n.id}>
                  <Link href={n.href} onClick={() => setAberto(false)} className="flex gap-3 px-4 py-3 hover:bg-slate-50">
                    <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", COR[n.tom])} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        <span className="sr-only">{TEXTO_TOM[n.tom]}: </span>
                        {n.titulo}
                      </span>
                      <span className="block text-xs text-slate-500">{n.detalhe}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
