"use client";

import clsx from "clsx";
import { Download, HelpCircle, Search, X } from "lucide-react";
import { forwardRef, useState } from "react";
import { type Agrupamento, escreverFiltro, lerConsulta, rotuloFiltro } from "@/lib/fluxo/consulta";
import { Kbd } from "./selos";

const AJUDA: [string, string][] = [
  ["etapa:triagem", "etapa (triagem, elaboracao, correcao, protocolado)"],
  ["-etapa:protocolado", "o sinal de menos nega qualquer filtro"],
  ["resp:ana", "responsável pelo começo do nome; resp:nenhum"],
  ["area:trabalhista", "área de atuação (aceita o começo: area:trab)"],
  ["prescreve:<30", "prescrição em até N dias"],
  ["prazo:estourado", "prazo da etapa estourado (ou prazo:atencao)"],
  ["estado:pronto", "pronto para avançar (ou estado:bloqueado)"],
  ['"banco pan"', "qualquer outra palavra busca no cliente, parte e número"],
];

interface Props {
  consulta: string;
  onConsulta: (q: string) => void;
  agrupar: Agrupamento;
  onAgrupar: (a: Agrupamento) => void;
  onExportar: () => void;
  nomeDe: (id: string) => string | undefined;
}

/** Busca com filtros digitados: o que o sistema entendeu aparece em etiquetas removíveis. */
export const BarraConsulta = forwardRef<HTMLInputElement, Props>(function BarraConsulta({ consulta, onConsulta, agrupar, onAgrupar, onExportar, nomeDe }, ref) {
  const [ajuda, setAjuda] = useState(false);
  const lida = lerConsulta(consulta);

  function remover(i: number) {
    const filtros = lida.filtros.filter((_, j) => j !== i).map(escreverFiltro);
    onConsulta([...filtros, ...lida.termos].join(" "));
  }

  return (
    <div className="mb-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            ref={ref}
            value={consulta}
            onChange={(e) => onConsulta(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (e.currentTarget.blur(), consulta && onConsulta(""))}
            placeholder="Buscar ou filtrar: etapa:triagem resp:ana prescreve:<30"
            aria-label="Buscar e filtrar casos"
            spellCheck={false}
            className="block w-full rounded-lg border-0 bg-white py-2 pl-9 pr-16 font-mono text-[13px] text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:font-sans placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-600"
          />
          <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {!consulta && <Kbd>/</Kbd>}
            <button type="button" onClick={() => setAjuda((a) => !a)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Como filtrar" aria-expanded={ajuda}>
              <HelpCircle className="h-4 w-4" />
            </button>
          </span>
          {ajuda && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg sm:right-auto sm:w-[30rem]">
              <p className="mb-2 font-semibold text-slate-700">Filtros que a busca entende</p>
              <ul className="space-y-1">
                {AJUDA.map(([ex, d]) => (
                  <li key={ex} className="flex gap-3">
                    <button type="button" className="shrink-0 rounded bg-slate-100 px-1.5 font-mono text-slate-800 hover:bg-brand-50" onClick={() => onConsulta(`${consulta.trim()} ${ex}`.trim())}>
                      {ex}
                    </button>
                    <span className="text-slate-500">{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-white px-3 text-sm text-slate-600 shadow-sm ring-1 ring-inset ring-slate-300">
            Agrupar
            <select value={agrupar} onChange={(e) => onAgrupar(e.target.value as Agrupamento)} className="border-0 bg-transparent py-2 pl-0 pr-6 text-sm font-medium text-slate-800 focus:ring-0">
              <option value="etapa">Etapa</option>
              <option value="responsavel">Responsável</option>
              <option value="area">Área</option>
              <option value="nenhum">Nada</option>
            </select>
          </label>
          <button type="button" onClick={onExportar} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-white px-3 py-2 text-sm text-slate-600 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
            <Download className="h-4 w-4" aria-hidden />
            Exportar
          </button>
        </div>
      </div>
      {(lida.filtros.length > 0 || lida.invalidos.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {lida.filtros.map((f, i) => (
            <span key={`${escreverFiltro(f)}-${i}`} className={clsx("inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs font-medium", f.negado ? "bg-slate-200 text-slate-700" : "bg-brand-50 text-brand-800")}>
              {rotuloFiltro(f, nomeDe)}
              <button type="button" onClick={() => remover(i)} className="rounded-full p-0.5 hover:bg-black/10" aria-label={`Remover filtro ${rotuloFiltro(f, nomeDe)}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {lida.invalidos.map((t) => (
            <span key={t} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800" title="Este filtro não foi entendido e está sendo ignorado">
              Não entendi “{t}”
            </span>
          ))}
        </div>
      )}
    </div>
  );
});
