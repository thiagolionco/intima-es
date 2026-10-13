"use client";

import clsx from "clsx";
import { AlarmClock, CalendarClock, CalendarDays, Clock, OctagonAlert, Search, Sun } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SeloResponsavel } from "@/components/equipe";
import { Card, EmptyState, Input, PageHeader, Select, Skeleton, StatusBadge } from "@/components/ui";
import { FaixaCobertura } from "@/components/vigilia";
import { seloDeVigilia } from "@/lib/cobertura";
import { abasPorCliente, aberta, filaDeHoje, FILTROS_HOJE, type FiltrosHoje, type ItemHoje, type StatusHoje, type Urgencia } from "@/lib/hoje";
import { dataBR } from "@/lib/prazos/datas";
import { useStore } from "@/lib/store";
import { useCobertura } from "@/lib/use-cobertura";
import { formatProcesso, hojeISO, STATUS_LABEL, STATUS_ORDER } from "@/lib/utils";

const ESTILO_URGENCIA = {
  vencido: { icone: OctagonAlert, cor: "bg-red-50 text-red-700 ring-red-600/20" },
  hoje: { icone: AlarmClock, cor: "bg-red-50 text-red-700 ring-red-600/20" },
  amanha: { icone: Clock, cor: "bg-amber-50 text-amber-800 ring-amber-600/20" },
  semana: { icone: CalendarClock, cor: "bg-amber-50 text-amber-800 ring-amber-600/20" },
  depois: { icone: CalendarDays, cor: "bg-slate-50 text-slate-600 ring-slate-500/20" },
};

/** Ícone, texto e cor juntos: a urgência nunca depende só da cor. */
function SeloUrgencia({ u, prazo }: { u: Urgencia; prazo: string }) {
  const { icone: Icone, cor } = ESTILO_URGENCIA[u.nivel];
  return (
    <span className={clsx("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", cor)} title={`Prazo: ${dataBR(prazo)}`}>
      <Icone className="h-3.5 w-3.5" aria-hidden />
      {u.texto}
    </span>
  );
}

function Linha({ item }: { item: ItemHoje }) {
  const { intimacao: i, urgencia: u } = item;
  const ehAberta = aberta(i);
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
      <div className="sm:w-40 sm:pt-0.5">{ehAberta ? <SeloUrgencia u={u} prazo={i.prazo!} /> : <StatusBadge status={i.status} />}</div>
      <div className="min-w-0 flex-1">
        <Link href={`/intimacoes/${i.id}`} className="break-all font-mono text-xs font-semibold text-slate-800 hover:text-brand-700">
          {formatProcesso(i.numeroProcesso) || "Sem número de processo"}
        </Link>
        <p className="mt-0.5 text-sm text-slate-700">
          <span className="font-medium">{i.cliente}</span>
          <span className="text-slate-500">
            {" · "}
            {i.tipoComunicacao}
            {i.tribunal && ` · ${i.tribunal}`}
          </span>
        </p>
        {i.resumo?.texto && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{i.resumo.texto}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 sm:w-48 sm:flex-col sm:items-end">
        <span>Prazo {dataBR(i.prazo!)}</span>
        <SeloResponsavel id={i.responsavelId} />
        {ehAberta && <StatusBadge status={i.status} />}
      </div>
    </li>
  );
}

export default function HojePage() {
  const { ready, intimacoes, termos, equipe } = useStore();
  const { cobertura } = useCobertura();
  const [filtros, setFiltros] = useState<FiltrosHoje>(FILTROS_HOJE);
  const hoje = hojeISO();
  const set = <K extends keyof FiltrosHoje>(k: K, v: FiltrosHoje[K]) => setFiltros((f) => ({ ...f, [k]: v }));

  const monitorados = useMemo(() => [...new Set(termos.filter((t) => t.ativo).map((t) => t.apelido))], [termos]);
  const fila = useMemo(() => filaDeHoje(intimacoes, filtros, hoje), [intimacoes, filtros, hoje]);
  const abas = useMemo(() => abasPorCliente(intimacoes, filtros, hoje, monitorados), [intimacoes, filtros, hoje, monitorados]);
  const todasAbertas = useMemo(() => filaDeHoje(intimacoes, FILTROS_HOJE, hoje), [intimacoes, hoje]);
  const urgentes = todasAbertas.filter((x) => x.urgencia.dias <= 0).length;
  const totalAbas = abas.reduce((s, a) => s + a.total, 0);
  const tomVigilia = cobertura ? seloDeVigilia(cobertura, new Date()).tom : "neutro";
  const coberturaCompleta = tomVigilia === "ok" || tomVigilia === "neutro";

  if (!ready) {
    return (
      <>
        <PageHeader title="Hoje" description="Carregando os prazos…" />
        <Skeleton className="h-64" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Hoje"
        description={`${todasAbertas.length} prazo(s) em aberto · ${urgentes} vencido(s) ou vencendo hoje`}
      />

      <FaixaCobertura cobertura={cobertura} />

      {/* Abas por cliente: rolam na horizontal dentro da faixa, nunca a página. */}
      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Clientes">
        <div className="flex w-max gap-2">
          {[{ cliente: "", total: totalAbas, urgentes: 0 }, ...abas].map((a) => {
            const ativa = filtros.cliente === a.cliente;
            return (
              <button
                key={a.cliente || "__todos"}
                role="tab"
                aria-selected={ativa}
                onClick={() => set("cliente", a.cliente)}
                className={clsx(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition",
                  ativa ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
                )}
              >
                {a.cliente || "Todos"}
                <span className={clsx("text-xs", ativa ? "text-slate-300" : "text-slate-500")}>{a.total}</span>
                {a.urgentes > 0 && (
                  <span className={clsx("inline-flex items-center gap-0.5 text-xs font-semibold", ativa ? "text-red-300" : "text-red-700")}>
                    <OctagonAlert className="h-3 w-3" aria-hidden />
                    {a.urgentes} urgente(s)
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Card className="mb-4 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input value={filtros.busca} onChange={(e) => set("busca", e.target.value)} placeholder="Buscar por processo, parte ou texto…" className="pl-9" aria-label="Buscar" />
          </div>
          <Select value={filtros.status} onChange={(e) => set("status", e.target.value as StatusHoje)} aria-label="Situação">
            <option value="abertas">Em aberto</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
            <option value="todas">Todas</option>
          </Select>
          <Select value={filtros.responsavel} onChange={(e) => set("responsavel", e.target.value)} aria-label="Responsável">
            <option value="">Todos os responsáveis</option>
            <option value="nenhum">Sem responsável</option>
            {equipe
              .filter((p) => !p.inativa)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
          </Select>
        </div>
      </Card>

      <Card>
        {fila.length === 0 ? (
          <EmptyState
            icon={<Sun className="h-6 w-6" />}
            title={todasAbertas.length ? "Nenhum prazo com estes filtros" : "Nenhum prazo em aberto"}
            description={
              coberturaCompleta
                ? "As intimações com prazo aparecem aqui, da mais urgente para a menos urgente."
                : "Nenhum entre as intimações já encontradas. Há dias sem verificação no Comunica: veja o aviso acima."
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {fila.map((item) => (
              <Linha key={item.intimacao.id} item={item} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
