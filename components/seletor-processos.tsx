"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { type Processo, referencia } from "@/lib/processos";
import { formatProcesso, normalizar } from "@/lib/utils";
import { Input } from "./ui";

/** Lista de processos com busca e caixas de marcar. */
export function SeletorProcessos({
  processos,
  marcados,
  onMudar,
  maximo,
  id = "seletor-processos",
}: {
  processos: Processo[];
  marcados: string[];
  onMudar: (ids: string[]) => void;
  maximo?: number;
  id?: string;
}) {
  const [busca, setBusca] = useState("");
  const lista = useMemo(() => {
    const t = normalizar(busca.trim());
    return processos.filter((p) => !t || normalizar(`${p.numero ?? ""} ${p.cliente} ${p.parteContraria ?? ""} ${p.classe ?? ""}`).includes(t));
  }, [processos, busca]);
  const cheio = maximo !== undefined && marcados.length >= maximo;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input id={id} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar por número, cliente ou parte" className="pl-9" aria-label="Filtrar processos" />
        </div>
        <button
          type="button"
          className="text-sm font-medium text-brand-700 hover:underline"
          onClick={() => onMudar([...new Set([...marcados, ...lista.map((p) => p.id)])].slice(0, maximo ?? Infinity))}
        >
          Marcar os {Math.min(lista.length, maximo ?? lista.length)} da lista
        </button>
        {marcados.length > 0 && (
          <button type="button" className="text-sm text-slate-500 hover:underline" onClick={() => onMudar([])}>
            Limpar
          </button>
        )}
      </div>
      <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {lista.map((p) => {
          const marcado = marcados.includes(p.id);
          return (
            <li key={p.id}>
              <label className="flex cursor-pointer items-start gap-3 px-4 py-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600"
                  checked={marcado}
                  disabled={cheio && !marcado}
                  onChange={(e) => onMudar(e.target.checked ? [...marcados, p.id] : marcados.filter((x) => x !== p.id))}
                />
                <span className="min-w-0">
                  <span className="block text-sm text-slate-800">{referencia(p)}</span>
                  <span className="block font-mono text-xs text-slate-500">{p.numero ? formatProcesso(p.numero) : "Sem número"}</span>
                </span>
              </label>
            </li>
          );
        })}
        {!lista.length && <li className="px-4 py-3 text-sm text-slate-500">Nenhum processo encontrado.</li>}
      </ul>
      <p className="mt-1 text-xs text-slate-500">
        {marcados.length} marcado(s){maximo ? ` de até ${maximo}` : ""}
      </p>
    </div>
  );
}
