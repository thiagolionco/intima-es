"use client";

import clsx from "clsx";
import { Building2, CalendarClock, CalendarDays, Pencil, Scale, Trash2, Users } from "lucide-react";
import Link from "next/link";
import type { Intimacao, StatusIntimacao } from "@/lib/types";
import { diffDays, formatDate, hojeISO, resumo, STATUS_LABEL, STATUS_ORDER } from "@/lib/utils";
import { Badge, StatusBadge } from "./ui";

export function PrazoTag({ prazo, status }: { prazo?: string; status: StatusIntimacao }) {
  if (!prazo || status === "respondida" || status === "arquivada") return null;
  const dias = diffDays(hojeISO(), prazo);
  const tom = dias < 0 ? "bg-red-50 text-red-700 ring-red-600/20" : dias <= 3 ? "bg-amber-50 text-amber-800 ring-amber-600/20" : "bg-slate-50 text-slate-600 ring-slate-500/20";
  const texto = dias < 0 ? `Vencido há ${-dias}d` : dias === 0 ? "Vence hoje" : `Vence em ${dias}d`;
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tom)} title={`Prazo: ${formatDate(prazo)}`}>
      <CalendarClock className="h-3 w-3" aria-hidden />
      {texto}
    </span>
  );
}

interface Props {
  intimacao: Intimacao;
  selecionada?: boolean;
  onSelecionar?: (v: boolean) => void;
  onStatus?: (s: StatusIntimacao) => void;
  onExcluir?: () => void;
  compacto?: boolean;
}

export function IntimacaoCard({ intimacao: i, selecionada, onSelecionar, onStatus, onExcluir, compacto }: Props) {
  const partes = i.partes.map((p) => p.nome).join(" × ");
  return (
    <article
      className={clsx(
        "group relative rounded-xl border bg-white p-4 shadow-card transition hover:border-brand-200 hover:shadow-md",
        selecionada ? "border-brand-300 ring-1 ring-brand-300" : "border-slate-200",
        i.status === "nova" && "border-l-4 border-l-brand-500",
      )}
    >
      <div className="flex items-start gap-3">
        {onSelecionar && (
          <input
            type="checkbox"
            checked={!!selecionada}
            onChange={(e) => onSelecionar(e.target.checked)}
            className="relative z-10 mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
            aria-label="Selecionar intimação"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={i.status} />
            <Badge>{i.tipoComunicacao}</Badge>
            {i.tribunal && <Badge className="bg-brand-50 text-brand-700">{i.tribunal}</Badge>}
            <PrazoTag prazo={i.prazo} status={i.status} />
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              {formatDate(i.dataDisponibilizacao)}
            </span>
          </div>

          <Link href={`/intimacoes/${i.id}`} className="mt-2 block focus:outline-none">
            <span className="absolute inset-0 rounded-xl" aria-hidden />
            <h3 className="truncate font-mono text-sm font-semibold text-slate-900">{i.numeroProcesso || "Processo não informado"}</h3>
            <p className="mt-0.5 truncate text-sm font-medium text-slate-700">{i.cliente}</p>
          </Link>

          {!compacto && (
            <dl className="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
              <div className="flex items-center gap-1.5 truncate">
                <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{i.orgao || "—"}</span>
              </div>
              <div className="flex items-center gap-1.5 truncate">
                <Scale className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{i.classe || "Classe não informada"}</span>
              </div>
              {partes && (
                <div className="flex items-center gap-1.5 truncate sm:col-span-2">
                  <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{partes}</span>
                </div>
              )}
            </dl>
          )}

          <p className={clsx("mt-2 text-sm text-slate-600", compacto ? "line-clamp-2" : "line-clamp-3")}>{resumo(i.texto, compacto ? 160 : 320)}</p>

          {(onStatus || onExcluir) && (
            <div className="relative z-10 mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              {onStatus && (
                <select
                  value={i.status}
                  onChange={(e) => onStatus(e.target.value as StatusIntimacao)}
                  className="rounded-md border-0 bg-slate-50 py-1 pl-2 pr-7 text-xs text-slate-700 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-brand-600"
                  aria-label="Alterar status"
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              )}
              <span className="text-xs text-slate-400">{i.origem === "comunica" ? "Importada do Comunica" : "Cadastro manual"}</span>
              <div className="ml-auto flex gap-1">
                <Link href={`/intimacoes/${i.id}/editar`} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Editar" title="Editar">
                  <Pencil className="h-4 w-4" />
                </Link>
                {onExcluir && (
                  <button onClick={onExcluir} className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label="Excluir" title="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
