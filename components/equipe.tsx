"use client";

import clsx from "clsx";
import { iniciais } from "@/lib/equipe";
import { useStore } from "@/lib/store";
import type { PessoaEquipe } from "@/lib/types";
import { Select } from "./ui";

const CORES = ["bg-sky-100 text-sky-800", "bg-violet-100 text-violet-800", "bg-emerald-100 text-emerald-800", "bg-amber-100 text-amber-800", "bg-rose-100 text-rose-800", "bg-teal-100 text-teal-800"];

function cor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}

/** Bolinha com as iniciais da pessoa. */
export function Avatar({ pessoa, className }: { pessoa: PessoaEquipe; className?: string }) {
  return (
    <span className={clsx("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", cor(pessoa.id), className)} aria-hidden>
      {iniciais(pessoa.nome)}
    </span>
  );
}

/** Nome do responsável com as iniciais; nada quando a intimação não tem responsável. */
export function SeloResponsavel({ id, className }: { id?: string; className?: string }) {
  const { equipe } = useStore();
  const pessoa = id ? equipe.find((p) => p.id === id) : undefined;
  if (!pessoa) return null;
  return (
    <span className={clsx("inline-flex min-w-0 items-center gap-1.5 text-xs text-slate-600", className)} title={`Responsável: ${pessoa.nome}`}>
      <Avatar pessoa={pessoa} className="h-5 w-5" />
      <span className="truncate">{pessoa.nome}</span>
    </span>
  );
}

/** Escolha do responsável entre as pessoas ativas da equipe (mais a atual, se estiver inativa). */
export function SeletorResponsavel({ value, onChange, className, rotuloVazio = "Sem responsável", ...rest }: { value?: string; onChange: (id: string | null) => void; className?: string; rotuloVazio?: string; "aria-label"?: string; id?: string }) {
  const { equipe } = useStore();
  const opcoes = equipe.filter((p) => !p.inativa || p.id === value);
  return (
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={className} {...rest}>
      <option value="">{rotuloVazio}</option>
      {opcoes.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nome}
          {p.inativa ? " (inativa)" : ""}
        </option>
      ))}
    </Select>
  );
}
