"use client";

import { Calculator, Scale } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card, Input, PageHeader } from "@/components/ui";
import { CALCULADORAS } from "@/lib/calculadoras/catalogo";

const AREAS = ["Todas", "Trabalhista", "Cível", "Penal", "Geral"] as const;

function normalizar(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function CalculadorasPage() {
  const [area, setArea] = useState<(typeof AREAS)[number]>("Todas");
  const [busca, setBusca] = useState("");
  const lista = CALCULADORAS.filter((c) => (area === "Todas" || c.area === area) && normalizar(`${c.titulo} ${c.descricao} ${c.base}`).includes(normalizar(busca)));
  return (
    <>
      <PageHeader title="Calculadoras" description="Contas do dia a dia da advocacia, cada passo com o dispositivo legal e a memória de cálculo para copiar na peça." />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input aria-label="Buscar calculadora" placeholder="Buscar: prescrição, honorários, pena…" value={busca} onChange={(e) => setBusca(e.target.value)} className="sm:max-w-xs" />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Área">
          {AREAS.map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={area === a}
              onClick={() => setArea(a)}
              className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${area === a ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"}`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {lista.map((c) => (
          <Link key={c.slug} href={`/calculadoras/${c.slug}`} className="group">
            <Card className="flex h-full flex-col p-5 transition group-hover:border-brand-300 group-hover:shadow-md">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Calculator className="h-5 w-5" aria-hidden />
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{c.area}</span>
              </div>
              <h2 className="text-base font-semibold text-slate-900 group-hover:text-brand-700">{c.titulo}</h2>
              <p className="mt-1 flex-1 text-sm text-slate-500">{c.descricao}</p>
              {c.base && (
                <p className="mt-3 inline-flex items-center gap-1 text-xs text-brand-700">
                  <Scale className="h-3 w-3" aria-hidden /> {c.base}
                </p>
              )}
            </Card>
          </Link>
        ))}
        {lista.length === 0 && <p className="text-sm text-slate-500">Nenhuma calculadora encontrada.</p>}
      </div>
    </>
  );
}
