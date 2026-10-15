"use client";

import clsx from "clsx";
import { Search } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { normalizar } from "@/lib/utils";
import { Kbd } from "./selos";

/** Uma entrada da paleta. Casos, ações e navegação usam o mesmo formato. */
export interface Comando {
  id: string;
  grupo: string;
  rotulo: string;
  /** Palavras extras que a busca considera (número do processo, sinônimos). */
  busca?: string;
  icone?: ReactNode;
  detalhe?: ReactNode;
  atalho?: string;
  desabilitado?: boolean;
  executar: () => void;
}

/** Todas as palavras digitadas precisam aparecer (em qualquer ordem). */
function combina(c: Comando, termos: string[]) {
  const alvo = normalizar(`${c.rotulo} ${c.busca ?? ""} ${c.grupo}`);
  return termos.every((t) => alvo.includes(t));
}

export function PaletaComandos({ aberta, onFechar, comandos }: { aberta: boolean; onFechar: () => void; comandos: Comando[] }) {
  const [texto, setTexto] = useState("");
  const [indice, setIndice] = useState(0);
  const lista = useRef<HTMLDivElement>(null);
  const anterior = useRef<HTMLElement | null>(null);

  const filtrados = useMemo(() => {
    const termos = normalizar(texto).split(/\s+/).filter(Boolean);
    const r = comandos.filter((c) => combina(c, termos));
    // Sem texto, mostra as ações e poucos casos; com texto, até 8 casos.
    const casos = r.filter((c) => c.grupo === "Casos").slice(0, termos.length ? 8 : 3);
    return [...casos, ...r.filter((c) => c.grupo !== "Casos")];
  }, [comandos, texto]);

  useEffect(() => {
    if (aberta) {
      anterior.current = document.activeElement as HTMLElement | null;
      setTexto("");
      setIndice(0);
    } else anterior.current?.focus?.();
  }, [aberta]);

  useEffect(() => setIndice(0), [texto]);
  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${indice}"]`)?.scrollIntoView({ block: "nearest" });
  }, [indice]);

  if (!aberta) return null;

  function executar(c?: Comando) {
    if (!c || c.desabilitado) return;
    onFechar();
    c.executar();
  }

  let grupoAnterior = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/40 backdrop-blur-[1px]" onClick={onFechar} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Paleta de comandos" className="relative w-full max-w-xl animate-slide-in overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" aria-hidden />
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") (e.preventDefault(), setIndice((i) => Math.min(i + 1, filtrados.length - 1)));
              else if (e.key === "ArrowUp") (e.preventDefault(), setIndice((i) => Math.max(i - 1, 0)));
              else if (e.key === "Enter") (e.preventDefault(), executar(filtrados[indice]));
              else if (e.key === "Escape") (e.preventDefault(), onFechar());
            }}
            placeholder="Buscar caso ou ação…"
            aria-label="Buscar caso ou ação"
            role="combobox"
            aria-expanded
            aria-controls="paleta-lista"
            aria-activedescendant={filtrados[indice] ? `paleta-${filtrados[indice].id}` : undefined}
            className="flex-1 border-0 p-0 text-base text-slate-900 shadow-none outline-none placeholder:text-slate-400 focus:outline-none focus:ring-0"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={lista} id="paleta-lista" role="listbox" className="max-h-[50vh] overflow-y-auto py-2 text-sm">
          {!filtrados.length && <p className="px-4 py-6 text-center text-slate-400">Nada encontrado.</p>}
          {filtrados.map((c, i) => {
            const cabecalho = c.grupo !== grupoAnterior ? c.grupo : undefined;
            grupoAnterior = c.grupo;
            return (
              <div key={c.id}>
                {cabecalho && <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{cabecalho}</p>}
                <div
                  id={`paleta-${c.id}`}
                  role="option"
                  aria-selected={i === indice}
                  aria-disabled={c.desabilitado}
                  data-indice={i}
                  onMouseMove={() => setIndice(i)}
                  onClick={() => executar(c)}
                  className={clsx("mx-2 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2", i === indice ? "bg-brand-50 text-brand-900" : "text-slate-700", c.desabilitado && "cursor-not-allowed opacity-60")}
                >
                  <span className="flex w-8 shrink-0 justify-center text-slate-400">{c.icone}</span>
                  <span className="min-w-0 flex-1 truncate">{c.rotulo}</span>
                  {c.detalhe && <span className="shrink-0 text-xs text-slate-400">{c.detalhe}</span>}
                  {c.atalho && <Kbd>{c.atalho}</Kbd>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> escolher
          </span>
          <span>
            <Kbd>↵</Kbd> executar
          </span>
        </div>
      </div>
    </div>
  );
}
