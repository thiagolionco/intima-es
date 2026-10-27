"use client";

import clsx from "clsx";
import Link from "next/link";

/** As duas abas da área do Comunica PJe: a busca e os clientes que ela pesquisa. */
export function AbasComunica({ atual, clientes }: { atual: "buscar" | "clientes"; clientes?: number }) {
  const abas = [
    { id: "buscar", rotulo: "Buscar no PJe", href: "/comunica", n: undefined },
    { id: "clientes", rotulo: "Clientes monitorados", href: "/clientes", n: clientes },
  ] as const;
  return (
    <nav className="mb-6 border-b border-slate-200" aria-label="Comunica PJe">
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
            {a.n !== undefined && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{a.n}</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}
