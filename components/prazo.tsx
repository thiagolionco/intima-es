"use client";

import clsx from "clsx";
import { Calculator, CalendarCheck2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { calcularPrazo, calendarioDa, contagemPadrao, lerPrazoDoTexto, DIAS_MAXIMOS, type ResultadoPrazo } from "@/lib/prazos/calculo";
import { dataBR, diaDaSemana, NOMES_DIAS } from "@/lib/prazos/datas";
import { useStore } from "@/lib/store";
import type { Intimacao, RegraPrazo } from "@/lib/types";
import { DatePicker } from "./date-picker";
import { Button, Input, Select } from "./ui";

type Base = Pick<Intimacao, "tribunal" | "dataDisponibilizacao" | "texto" | "classe" | "orgao">;

/** Explica como o vencimento foi obtido: publicação, início, dias contados e dias pulados. */
export function MemoriaPrazo({ r, regra, className }: { r: ResultadoPrazo; regra: RegraPrazo; className?: string }) {
  const unidade = r.contagem === "uteis" ? "dias úteis" : "dias corridos";
  return (
    <div className={clsx("rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600 ring-1 ring-inset ring-slate-200", className)}>
      <p className="text-sm font-semibold text-slate-900">
        Vence {NOMES_DIAS[diaDaSemana(r.fim)]}, {dataBR(r.fim)}
      </p>
      <p className="mt-1">
        Publicação em {dataBR(r.publicacao)}, contagem a partir de {dataBR(r.inicio)}: {r.dias} {unidade}
        {regra.dobro && ` (${regra.dias} em dobro)`}.
      </p>
      {(r.pulados.length > 0 || r.finsDeSemana > 0) && (
        <p className="mt-1">
          Não contados:{" "}
          {[
            ...r.pulados.map((p) => `${dataBR(p.data).slice(0, 5)} ${p.motivo}`),
            ...(r.finsDeSemana && r.contagem === "uteis" ? [`${r.finsDeSemana} dia(s) de fim de semana`] : []),
          ].join("; ")}
          .
        </p>
      )}
      {r.prorrogadoDe && <p className="mt-1">O último dia ({dataBR(r.prorrogadoDe)}) caiu sem expediente e o vencimento passou para o dia útil seguinte.</p>}
      <p className="mt-1 text-slate-500">
        Feriados locais e suspensões do tribunal entram só se estiverem em{" "}
        <Link href="/prazos" className="font-medium text-brand-700 hover:underline">
          Prazos e feriados
        </Link>
        .
      </p>
    </div>
  );
}

/** Calcula o vencimento de uma intimação com as suspensões do escritório. */
export function usePrazoCalculado(i: Pick<Intimacao, "tribunal" | "dataDisponibilizacao">, regra?: RegraPrazo | null) {
  const { suspensoes } = useStore();
  return useMemo(() => (regra ? calcularPrazo(i.dataDisponibilizacao, regra, calendarioDa(i, suspensoes)) : null), [i, regra, suspensoes]);
}

interface EditorProps {
  base: Base;
  prazo: string;
  regra: RegraPrazo | null;
  onChange: (prazo: string, regra: RegraPrazo | null) => void;
  erro?: string;
}

/** Campo de prazo do formulário: calculado a partir dos dias ou informado à mão. */
export function EditorPrazo({ base, prazo, regra, onChange, erro }: EditorProps) {
  const lido = useMemo(() => lerPrazoDoTexto(base.texto), [base.texto]);
  const resultado = usePrazoCalculado(base, regra);
  const modo = regra ? "calcular" : "data";

  const mudarRegra = (parcial: Partial<RegraPrazo>) => {
    const nova: RegraPrazo = { dias: 15, contagem: contagemPadrao(base), dobro: false, ...regra, ...parcial, fonte: "usuario", trecho: undefined };
    onChange(prazo, nova);
  };
  const usarTexto = () => {
    if (!lido) return;
    onChange(prazo, { dias: lido.dias, contagem: lido.contagem ?? contagemPadrao(base), dobro: regra?.dobro ?? false, fonte: "texto", trecho: lido.trecho });
  };

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm" role="radiogroup" aria-label="Como definir o prazo">
        {(
          [
            ["calcular", "Calcular pelos dias", Calculator],
            ["data", "Informar a data", CalendarCheck2],
          ] as const
        ).map(([valor, rotulo, Icone]) => (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={modo === valor}
            onClick={() => (valor === "data" ? onChange(resultado?.fim ?? prazo, null) : lido ? usarTexto() : mudarRegra({}))}
            className={clsx("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition", modo === valor ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}
          >
            <Icone className="h-4 w-4" aria-hidden />
            {rotulo}
          </button>
        ))}
      </div>

      {regra ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1.5 block font-medium text-slate-700">Dias</span>
              <Input
                type="number"
                min={1}
                max={DIAS_MAXIMOS}
                value={regra.dias || ""}
                onChange={(e) => mudarRegra({ dias: Number(e.target.value) })}
                className="w-24"
                invalid={!!erro}
                aria-label="Quantidade de dias do prazo"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1.5 block font-medium text-slate-700">Contagem</span>
              <Select value={regra.contagem} onChange={(e) => mudarRegra({ contagem: e.target.value as RegraPrazo["contagem"] })} className="w-40">
                <option value="uteis">Dias úteis</option>
                <option value="corridos">Dias corridos</option>
              </Select>
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
              <input type="checkbox" checked={regra.dobro} onChange={(e) => mudarRegra({ dobro: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
              Em dobro
            </label>
          </div>
          {regra.fonte === "texto" && regra.trecho ? (
            <p className="flex items-start gap-1.5 text-xs text-amber-800">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Lido no texto: “{regra.trecho}”. Confira antes de salvar.
            </p>
          ) : (
            lido &&
            lido.dias !== regra.dias && (
              <Button type="button" size="sm" variant="ghost" icon={<Sparkles className="h-4 w-4" />} onClick={usarTexto}>
                Usar o prazo do texto: {lido.dias} dias
              </Button>
            )
          )}
          {erro ? (
            <p className="text-xs text-red-600" role="alert">
              {erro}
            </p>
          ) : resultado ? (
            <MemoriaPrazo r={resultado} regra={regra} />
          ) : null}
        </>
      ) : (
        <div className="max-w-xs">
          <DatePicker id="prazo" value={prazo} onChange={(v) => onChange(v, null)} min={base.dataDisponibilizacao || undefined} invalid={!!erro} />
          {erro ? (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {erro}
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Data limite para providência.</p>
          )}
        </div>
      )}
    </div>
  );
}
