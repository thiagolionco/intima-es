"use client";

import clsx from "clsx";
import Link from "next/link";

/** Abas que são páginas (cada uma com o seu endereço). */
export function AbasDeRota({ abas, atual, rotulo }: { abas: { id: string; rotulo: string; href: string; n?: number }[]; atual: string; rotulo: string }) {
  return (
    <nav className="mb-6 border-b border-slate-200" aria-label={rotulo}>
      <div className="-mb-px flex gap-6 overflow-x-auto">
        {abas.map((a) => (
          <Link
            key={a.id}
            href={a.href}
            aria-current={atual === a.id ? "page" : undefined}
            className={clsx(
              "whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition",
              atual === a.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
            )}
          >
            {a.rotulo}
            {a.n !== undefined && a.n > 0 && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{a.n}</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** As abas da Biblioteca: itens guardados, pesquisa pela IA, padrões da IA e monitor de precedentes. */
export function AbasBiblioteca({ atual }: { atual: "itens" | "pesquisa" | "padroes" | "monitor" }) {
  return (
    <AbasDeRota
      rotulo="Biblioteca"
      atual={atual}
      abas={[
        { id: "itens", rotulo: "Itens guardados", href: "/biblioteca" },
        { id: "pesquisa", rotulo: "Pesquisa com IA", href: "/biblioteca/pesquisa" },
        { id: "padroes", rotulo: "Padrões da IA", href: "/biblioteca/padroes" },
        { id: "monitor", rotulo: "Monitor de precedentes", href: "/biblioteca/monitor" },
      ]}
    />
  );
}
