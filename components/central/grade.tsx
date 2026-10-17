"use client";

import clsx from "clsx";
import { ChevronDown, ChevronRight, ChevronUp, Lock } from "lucide-react";
import { useEffect, useRef } from "react";
import { Avatar } from "@/components/equipe";
import type { Coluna, Grupo, LinhaCaso, Ordem } from "@/lib/fluxo/consulta";
import { etapa } from "@/lib/fluxo/etapas";
import { AREA_LABEL, type FaseProcesso } from "@/lib/processos";
import type { PessoaEquipe } from "@/lib/types";
import { formatProcesso } from "@/lib/utils";
import { CelulaPrescricao, COR_ETAPA, Progresso, SiglaEtapa, TempoNaEtapa } from "./selos";

const COLUNAS: { id: Coluna; rotulo: string; classe?: string; compacta?: string }[] = [
  { id: "caso", rotulo: "Caso" },
  { id: "checklist", rotulo: "Checklist", classe: "hidden md:block", compacta: "hidden md:block lg:hidden" },
  { id: "naEtapa", rotulo: "Na etapa" },
  { id: "prescricao", rotulo: "Prescrição", classe: "hidden md:block", compacta: "hidden md:block lg:hidden" },
  { id: "area", rotulo: "Área", classe: "hidden xl:block", compacta: "hidden" },
  { id: "responsavel", rotulo: "Responsável", classe: "hidden lg:block", compacta: "hidden" },
];

const BASE = "grid grid-cols-[20px_minmax(0,1fr)_92px] items-center gap-3 md:grid-cols-[20px_minmax(0,1fr)_96px_100px_104px]";
const GRADE = `${BASE} lg:grid-cols-[20px_minmax(0,1fr)_96px_100px_104px_132px] xl:grid-cols-[20px_minmax(0,1fr)_96px_100px_104px_104px_132px]`;
/**
 * Com a ficha aberta (lg+), a ficha e as visões ocupam a maior parte da largura: só cabem o caso e o
 * tempo na etapa. Sem isto, as colunas fixas espremiam o nome do caso até sumir.
 */
const GRADE_COMPACTA = `${BASE} lg:grid-cols-[20px_minmax(0,1fr)_92px]`;

/** Classe de uma coluna, conforme a grade esteja compacta ou não. */
const classeDe = (id: Coluna, compacta?: boolean) => {
  const c = COLUNAS.find((x) => x.id === id)!;
  return compacta && c.compacta ? c.compacta : c.classe;
};

interface Props {
  grupos: Grupo[];
  agrupadoPorEtapa: boolean;
  ordem: Ordem;
  onOrdenar: (c: Coluna) => void;
  selecionados: Set<string>;
  onAlternar: (id: string, comShift: boolean) => void;
  onAlternarTodos: (ids: string[]) => void;
  cursor?: string;
  aberto?: string;
  onAbrir: (id: string) => void;
  recolhidos: Set<string>;
  onRecolher: (chave: string) => void;
  equipe: PessoaEquipe[];
  /** A ficha do caso está aberta ao lado da grade. */
  compacta?: boolean;
}

function Caixa({ marcada, parcial, onClick, rotulo }: { marcada: boolean; parcial?: boolean; onClick: (e: React.MouseEvent) => void; rotulo: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={parcial ? "mixed" : marcada}
      aria-label={rotulo}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={clsx(
        "flex h-4 w-4 items-center justify-center rounded text-[10px] text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600",
        marcada || parcial ? "bg-brand-600" : "bg-white ring-1 ring-inset ring-slate-300 hover:ring-slate-400",
      )}
    >
      {parcial ? "–" : marcada ? "✓" : ""}
    </button>
  );
}

function Linha({ l, props }: { l: LinhaCaso; props: Props }) {
  const ref = useRef<HTMLDivElement>(null);
  const p = l.processo;
  const ativo = props.aberto === p.id;
  const noCursor = props.cursor === p.id;
  const marcado = props.selecionados.has(p.id);
  const pessoa = p.responsavelId ? props.equipe.find((x) => x.id === p.responsavelId) : undefined;

  useEffect(() => {
    if (noCursor) ref.current?.scrollIntoView({ block: "nearest" });
  }, [noCursor]);

  return (
    <div
      ref={ref}
      role="row"
      aria-selected={marcado}
      onClick={() => props.onAbrir(p.id)}
      className={clsx(
        props.compacta ? GRADE_COMPACTA : GRADE,
        "cursor-pointer border-b border-slate-100 px-3 py-2.5 text-[13px] transition last:border-b-0",
        ativo ? "bg-brand-50/70 shadow-[inset_3px_0_0_theme(colors.brand.600)]" : marcado ? "bg-sky-50/50 hover:bg-sky-50" : "hover:bg-slate-50",
        noCursor && !ativo && "shadow-[inset_3px_0_0_theme(colors.slate.400)]",
      )}
    >
      <Caixa marcada={marcado} onClick={(e) => props.onAlternar(p.id, e.shiftKey)} rotulo={`Selecionar ${l.referencia}`} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          {!props.agrupadoPorEtapa && <SiglaEtapa fase={p.fase} />}
          <span className="truncate font-medium text-slate-900">{l.referencia}</span>
          {l.pronto === true && <span className="shrink-0 rounded bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-700">pronto</span>}
          {l.pronto === false && <Lock className="h-3 w-3 shrink-0 text-slate-400" aria-label={`${l.bloqueios} pendência(s) para avançar`} />}
        </span>
        {p.numero && <span className="block truncate font-mono text-[11px] text-slate-400">{formatProcesso(p.numero)}</span>}
      </span>
      <span className={classeDe("checklist", props.compacta)}>
        <Progresso {...l.checklist} />
      </span>
      <TempoNaEtapa dias={l.diasNaEtapa} prazoDias={etapa(p.fase).prazoDias} situacao={l.prazo} />
      <span className={classeDe("prescricao", props.compacta)}>
        <CelulaPrescricao dias={p.fase === "protocolado" ? undefined : l.diasPrescricao} />
      </span>
      <span className={clsx("truncate text-xs text-slate-600", classeDe("area", props.compacta))}>{p.area ? AREA_LABEL[p.area] : <span className="text-slate-400">—</span>}</span>
      <span className={clsx("min-w-0", classeDe("responsavel", props.compacta))}>
        {pessoa ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-700">
            <Avatar pessoa={pessoa} className="h-5 w-5" />
            <span className="truncate">{pessoa.nome}</span>
          </span>
        ) : (
          <span className="text-xs italic text-slate-400">sem responsável</span>
        )}
      </span>
    </div>
  );
}

/** Grade densa: ordena pelo cabeçalho, agrupa, seleciona com caixas (Shift seleciona o intervalo). */
export function GradeCasos(props: Props) {
  const { grupos, ordem, onOrdenar, selecionados, onAlternarTodos, recolhidos, onRecolher } = props;
  const visiveis = grupos.flatMap((g) => g.linhas.map((l) => l.processo.id));
  const marcadosVisiveis = visiveis.filter((id) => selecionados.has(id)).length;

  return (
    <div role="grid" aria-label="Casos" aria-multiselectable className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
      <div role="row" className={clsx(props.compacta ? GRADE_COMPACTA : GRADE, "sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500")}>
        <Caixa marcada={marcadosVisiveis > 0 && marcadosVisiveis === visiveis.length} parcial={marcadosVisiveis > 0 && marcadosVisiveis < visiveis.length} onClick={() => onAlternarTodos(visiveis)} rotulo="Selecionar todos os visíveis" />
        {COLUNAS.map((c) => (
          <button key={c.id} type="button" role="columnheader" aria-sort={ordem.coluna === c.id ? (ordem.direcao === "asc" ? "ascending" : "descending") : "none"} onClick={() => onOrdenar(c.id)} className={clsx("flex items-center gap-1 whitespace-nowrap text-left uppercase hover:text-slate-800", classeDe(c.id, props.compacta))}>
            {c.rotulo}
            {ordem.coluna === c.id && (ordem.direcao === "asc" ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />)}
          </button>
        ))}
      </div>
      {grupos.map((g) => {
        const fechado = recolhidos.has(g.chave);
        const fase = props.agrupadoPorEtapa ? (g.chave as FaseProcesso) : undefined;
        return (
          <div key={g.chave} role="rowgroup">
            {props.grupos.length > 1 || g.chave !== "todos" ? (
              <button type="button" onClick={() => onRecolher(g.chave)} aria-expanded={!fechado} className="flex w-full items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-1.5 text-left text-xs font-semibold text-slate-600 hover:bg-slate-100">
                {fechado ? <ChevronRight className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                {fase && <span className={clsx("h-2 w-2 rounded-sm", COR_ETAPA[fase].ponto)} aria-hidden />}
                {g.rotulo}
                <span className="font-normal text-slate-400">
                  {g.linhas.length}
                  {fechado && " · recolhido"}
                </span>
              </button>
            ) : null}
            {!fechado && g.linhas.map((l) => <Linha key={l.processo.id} l={l} props={props} />)}
          </div>
        );
      })}
    </div>
  );
}
