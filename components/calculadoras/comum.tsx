"use client";

import clsx from "clsx";
import { ArrowLeft, Check, Copy, Scale } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { DatePicker } from "@/components/date-picker";
import { Alert, Card, Field, Input } from "@/components/ui";
import { lerNumero, memoriaEmTexto, numeroBR, type Duracao, type Linha } from "@/lib/calculadoras/base";

export function CabecalhoCalculadora({ titulo, descricao }: { titulo: string; descricao: ReactNode }) {
  return (
    <div className="mb-6">
      <Link href="/calculadoras" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Calculadoras
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{titulo}</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">{descricao}</p>
    </div>
  );
}

/** Formulário à esquerda, resultado à direita (empilhados no celular). */
export function Layout({ formulario, resultado }: { formulario: ReactNode; resultado: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-6">{formulario}</div>
      <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">{resultado}</div>
    </div>
  );
}

export function Secao({ titulo, children, className }: { titulo?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={clsx("p-5", className)}>
      {titulo && <h2 className="mb-4 text-sm font-semibold text-slate-900">{titulo}</h2>}
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

/**
 * Campo numérico no formato brasileiro ("1.234,56"). Guarda o texto digitado e avisa o número
 * lido (ou null) a cada mudança; formata ao sair do campo.
 */
export function CampoNumero({
  id,
  label,
  valor,
  onChange,
  hint,
  casas = 2,
  prefixo,
  sufixo,
  obrigatorio,
  className,
}: {
  id: string;
  label: string;
  valor: number | null;
  onChange: (v: number | null) => void;
  hint?: string;
  casas?: number;
  prefixo?: string;
  sufixo?: string;
  obrigatorio?: boolean;
  className?: string;
}) {
  // Valores em reais sempre com centavos ("3.000,00"); os demais, sem zeros sobrando.
  const formatar = (n: number) => (prefixo === "R$" ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : numeroBR(n, casas));
  const [texto, setTexto] = useState(valor === null ? "" : formatar(valor));
  useEffect(() => {
    const lido = lerNumero(texto);
    if (lido !== valor) setTexto(valor === null ? "" : formatar(valor));
    // Só sincroniza quando o valor muda por fora (ex.: um botão de exemplo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);
  const invalido = texto.trim() !== "" && lerNumero(texto) === null;
  return (
    <Field label={label} htmlFor={id} hint={hint} error={invalido ? "Número inválido. Use vírgula para os centavos: 1.234,56" : undefined} required={obrigatorio} className={className}>
      <div className="relative">
        {prefixo && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">{prefixo}</span>}
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={texto}
          invalid={invalido}
          className={clsx(prefixo && "pl-9", sufixo && "pr-10")}
          onChange={(e) => {
            setTexto(e.target.value);
            onChange(lerNumero(e.target.value));
          }}
          onBlur={() => {
            const n = lerNumero(texto);
            if (n !== null) setTexto(formatar(n));
          }}
        />
        {sufixo && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">{sufixo}</span>}
      </div>
    </Field>
  );
}

export function CampoInteiro({ id, label, valor, onChange, min = 0, max, hint, className }: { id: string; label: string; valor: number; onChange: (v: number) => void; min?: number; max?: number; hint?: string; className?: string }) {
  return (
    <Field label={label} htmlFor={id} hint={hint} className={className}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={Number.isFinite(valor) ? valor : ""}
        onChange={(e) => {
          const n = Math.floor(Number(e.target.value));
          onChange(Number.isFinite(n) ? Math.max(min, max === undefined ? n : Math.min(max, n)) : min);
        }}
      />
    </Field>
  );
}

export function CampoData({ id, label, valor, onChange, hint, obrigatorio, className }: { id: string; label: string; valor: string; onChange: (v: string) => void; hint?: string; obrigatorio?: boolean; className?: string }) {
  return (
    <Field label={label} htmlFor={id} hint={hint} required={obrigatorio} className={className}>
      <DatePicker id={id} value={valor} onChange={onChange} />
    </Field>
  );
}

export function CampoDuracao({ id, label, valor, onChange, hint }: { id: string; label: string; valor: Duracao; onChange: (v: Duracao) => void; hint?: string }) {
  const parte = (k: keyof Duracao, rotulo: string, max?: number) => (
    <div className="flex-1">
      <Input
        id={k === "anos" ? id : `${id}-${k}`}
        type="number"
        min={0}
        max={max}
        inputMode="numeric"
        aria-label={`${label}: ${rotulo}`}
        value={valor[k]}
        onChange={(e) => onChange({ ...valor, [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
      />
      <span className="mt-1 block text-xs text-slate-500">{rotulo}</span>
    </div>
  );
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="flex gap-2">
        {parte("anos", "anos")}
        {parte("meses", "meses", 11)}
        {parte("dias", "dias", 29)}
      </div>
    </Field>
  );
}

export function Opcao({ id, label, marcado, onChange, detalhe }: { id: string; label: ReactNode; marcado: boolean; onChange: (v: boolean) => void; detalhe?: ReactNode }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
      <input id={id} type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
      <span className="min-w-0 flex-1">
        {label}
        {detalhe && <span className="block text-xs text-slate-500">{detalhe}</span>}
      </span>
    </label>
  );
}

/** Botões de escolha única em linha (ex.: modo da porcentagem). */
export function Escolha<T extends string>({ opcoes, valor, onChange, rotulo }: { opcoes: { id: T; rotulo: string }[]; valor: T; onChange: (v: T) => void; rotulo: string }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-2">
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={valor === o.id}
          onClick={() => onChange(o.id)}
          className={clsx(
            "rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition",
            valor === o.id ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50",
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

/** Resultado com memória de cálculo, base legal de cada linha, observações e botão de copiar. */
export function Resultado({ titulo, linhas, avisos = [], vazio, destaque }: { titulo: string; linhas: Linha[] | null; avisos?: string[]; vazio?: string; destaque?: ReactNode }) {
  const [copiado, setCopiado] = useState(false);
  if (!linhas) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-500">{vazio ?? "Preencha os campos para ver o cálculo."}</p>
      </Card>
    );
  }
  async function copiar() {
    try {
      await navigator.clipboard.writeText(memoriaEmTexto(titulo, linhas!, avisos));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência: nada a fazer.
    }
  }
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
        <button type="button" onClick={copiar} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
          {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copiado ? "Copiado" : "Copiar memória de cálculo"}
        </button>
      </div>
      {destaque && <div className="border-b border-slate-100 bg-brand-50/60 px-5 py-4">{destaque}</div>}
      <dl className="divide-y divide-slate-100">
        {linhas.map((l, i) => (
          <div key={i} className={clsx("grid gap-x-4 gap-y-0.5 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto]", l.destaque && "bg-slate-50")}>
            <dt className={clsx("text-sm", l.destaque ? "font-semibold text-slate-900" : "text-slate-700")}>{l.rotulo}</dt>
            <dd className={clsx("text-sm tabular-nums sm:text-right", l.destaque ? "font-semibold text-slate-900" : "text-slate-800")}>{l.valor}</dd>
            {(l.conta || l.base) && (
              <dd className="text-xs text-slate-500 sm:col-span-2">
                {l.conta}
                {l.conta && l.base && " · "}
                {l.base && (
                  <span className="inline-flex items-center gap-1 text-brand-700">
                    <Scale className="h-3 w-3" aria-hidden />
                    {l.base}
                  </span>
                )}
              </dd>
            )}
          </div>
        ))}
      </dl>
      {avisos.length > 0 && (
        <div className="space-y-2 border-t border-slate-100 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Observações</p>
          <ul className="list-disc space-y-1.5 pl-4 text-xs text-slate-600">
            {avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function AvisoConferencia() {
  return (
    <Alert tone="info">
      Cálculo de apoio, com a base legal de cada passo. Confira a legislação vigente, as súmulas e o entendimento do seu tribunal antes de usar em peça.
    </Alert>
  );
}
