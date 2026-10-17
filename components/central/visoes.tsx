"use client";

import clsx from "clsx";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { aplicar, type LinhaCaso, lerConsulta, VISOES_PADRAO, type Visao } from "@/lib/fluxo/consulta";
import { Kbd } from "./selos";

const PONTO: Record<NonNullable<Visao["tom"]>, string> = {
  vermelho: "bg-red-500",
  ambar: "bg-amber-500",
  verde: "bg-emerald-500",
  neutro: "bg-slate-400",
  vazio: "ring-1 ring-inset ring-slate-400",
};

const NUMERO: Partial<Record<NonNullable<Visao["tom"]>, string>> = { vermelho: "font-medium text-red-600", verde: "font-medium text-emerald-700" };

const CHAVE = "clepsa.central.visoes";

/** Visões guardadas neste navegador (preferência de quem usa, não dado do escritório). */
export function lerVisoesSalvas(): Visao[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x?.id === "string" && typeof x?.rotulo === "string" && typeof x?.consulta === "string").slice(0, 30) : [];
  } catch {
    return [];
  }
}

export function gravarVisoesSalvas(v: Visao[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(v));
  } catch {
    /* navegador sem armazenamento: a visão vale só nesta sessão */
  }
}

interface Props {
  linhas: LinhaCaso[];
  consulta: string;
  pessoas: { id: string; nome: string }[];
  salvas: Visao[];
  onEscolher: (consulta: string) => void;
  onSalvar: (rotulo: string) => void;
  onRemover: (id: string) => void;
}

function Item({ v, n, ativa, onClick, onRemover }: { v: Visao; n: number; ativa: boolean; onClick: () => void; onRemover?: () => void }) {
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onClick}
        aria-current={ativa ? "true" : undefined}
        className={clsx(
          "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition",
          ativa ? "bg-white font-medium text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {v.tom && <span className={clsx("h-2 w-2 shrink-0 rounded-full", PONTO[v.tom])} aria-hidden />}
          <span className="truncate">{v.rotulo}</span>
        </span>
        <span className={clsx("tabular-nums text-slate-400", n > 0 && v.tom && NUMERO[v.tom], onRemover && "group-hover:invisible")}>{n}</span>
      </button>
      {onRemover && (
        <button type="button" onClick={onRemover} className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 group-hover:block" aria-label={`Remover a visão ${v.rotulo}`}>
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}

/** Coluna de visões: as prontas do escritório e as que a pessoa salvou. */
export function PainelVisoes({ linhas, consulta, pessoas, salvas, onEscolher, onSalvar, onRemover }: Props) {
  const [nomeando, setNomeando] = useState(false);
  const [nome, setNome] = useState("");
  const conta = (q: string) => aplicar(linhas, lerConsulta(q), pessoas).length;
  const atual = consulta.trim();

  return (
    <nav aria-label="Visões" className="text-sm">
      <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Visões</p>
      <ul className="space-y-0.5">
        {VISOES_PADRAO.map((v) => (
          <Item key={v.id} v={v} n={conta(v.consulta)} ativa={atual === v.consulta} onClick={() => onEscolher(v.consulta)} />
        ))}
      </ul>
      <p className="mb-1.5 mt-5 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Minhas visões</p>
      <ul className="space-y-0.5">
        {salvas.map((v) => (
          <Item key={v.id} v={v} n={conta(v.consulta)} ativa={atual === v.consulta} onClick={() => onEscolher(v.consulta)} onRemover={() => onRemover(v.id)} />
        ))}
        {!salvas.length && <li className="px-2 py-1 text-xs text-slate-400">Filtre a grade e salve aqui para voltar com um clique.</li>}
      </ul>
      {nomeando ? (
        <form
          className="mt-2 px-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (nome.trim()) onSalvar(nome.trim().slice(0, 60));
            setNome("");
            setNomeando(false);
          }}
        >
          <input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => !nome && setNomeando(false)}
            onKeyDown={(e) => e.key === "Escape" && setNomeando(false)}
            placeholder="Nome da visão"
            aria-label="Nome da visão"
            className="w-full rounded-md border-0 px-2 py-1 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600"
          />
        </form>
      ) : (
        <button type="button" disabled={!atual || salvas.some((s) => s.consulta === atual) || VISOES_PADRAO.some((s) => s.consulta === atual)} onClick={() => setNomeando(true)} className="mt-2 inline-flex items-center gap-1 px-2 text-xs font-medium text-brand-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline">
          <Plus className="h-3 w-3" aria-hidden />
          Salvar a visão atual
        </button>
      )}

      <div className="mt-6 rounded-lg border border-dashed border-slate-300 p-3 text-[11px] leading-6 text-slate-500">
        <p className="mb-1 font-semibold text-slate-600">Atalhos</p>
        <p>
          <Kbd>J</Kbd> <Kbd>K</Kbd> navegar · <Kbd>X</Kbd> selecionar
        </p>
        <p>
          <Kbd>]</Kbd> avançar · <Kbd>[</Kbd> voltar etapa
        </p>
        <p>
          <Kbd>A</Kbd> atribuir · <Kbd>/</Kbd> buscar
        </p>
        <p>
          <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> comandos
        </p>
      </div>
    </nav>
  );
}

/** No celular, as visões viram uma lista de opções. */
export function SeletorVisoes({ consulta, salvas, onEscolher }: { consulta: string; salvas: Visao[]; onEscolher: (q: string) => void }) {
  const todas = [...VISOES_PADRAO, ...salvas];
  const atual = todas.find((v) => v.consulta === consulta.trim());
  return (
    <select
      value={atual?.id ?? ""}
      onChange={(e) => {
        const v = todas.find((x) => x.id === e.target.value);
        if (v) onEscolher(v.consulta);
      }}
      aria-label="Visão"
      className="block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600"
    >
      {!atual && <option value="">Filtro personalizado</option>}
      {todas.map((v) => (
        <option key={v.id} value={v.id}>
          {v.rotulo}
        </option>
      ))}
    </select>
  );
}
