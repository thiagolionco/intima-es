"use client";

import { Check, ExternalLink, RotateCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { IaPensando } from "@/components/ia/ia-pensando";
import { useToast } from "@/components/toast";
import { Badge, Button, Field, Select } from "@/components/ui";
import { api, ErroApi } from "@/lib/auth/api";
import {
  chaveDiaOficial,
  descricaoDoDia,
  filtrarPorLocal,
  jaCadastrados,
  locaisDoCalendario,
  NOMES_ABRANGENCIA,
  soOQueAcrescenta,
  type CalendarioOficial as Calendario,
  type DiaOficial,
} from "@/lib/prazos/calendario-oficial";
import { dataBR } from "@/lib/prazos/datas";
import { calendarioOficial } from "@/lib/prazos/tribunais";
import { useStore } from "@/lib/store";
import { uid } from "@/lib/utils";

type Estado = { tipo: "carregando" } | { tipo: "erro"; mensagem: string } | { tipo: "desligado" } | { tipo: "pronto"; calendario: Calendario };

const periodo = (d: DiaOficial) => (d.inicio === d.fim ? dataBR(d.inicio) : `${dataBR(d.inicio)} a ${dataBR(d.fim)}`);

/** Dias que só valem para um lugar ficam desmarcados: o escritório escolhe os da sua comarca. */
const marcadoDeInicio = (d: DiaOficial, local: string) => d.abrangencia === "nacional" || d.abrangencia === "estadual" || (!!local && d.local === local);

/** Última cidade escolhida em cada tribunal, só neste navegador. */
const chaveLocal = (tribunal: string) => `clepsa:prazos:local:${tribunal}`;
function lerLocal(tribunal: string): string {
  try {
    return localStorage.getItem(chaveLocal(tribunal)) ?? "";
  } catch {
    return "";
  }
}

/**
 * Calendário publicado pelo tribunal, lido pelo Clepsa. O advogado confere e escolhe o que entra
 * no cálculo dos prazos; nada daqui conta sozinho.
 */
export function CalendarioDoTribunal({ tribunal, ano }: { tribunal: string; ano: number }) {
  const { suspensoes, salvarSuspensoes } = useStore();
  const { toast } = useToast();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [local, setLocal] = useState("");

  useEffect(() => {
    const controle = new AbortController();
    setEstado({ tipo: "carregando" });
    api<{ disponivel: boolean; calendario?: Calendario }>(`/api/calendario-oficial?tribunal=${encodeURIComponent(tribunal)}&ano=${ano}`, { signal: controle.signal })
      .then((r) => {
        if (!r.disponivel || !r.calendario) return setEstado({ tipo: "desligado" });
        const salvo = lerLocal(tribunal);
        const l = locaisDoCalendario(r.calendario.dias).includes(salvo) ? salvo : "";
        setLocal(l);
        setEstado({ tipo: "pronto", calendario: r.calendario });
        setMarcados(new Set(r.calendario.dias.filter((d) => marcadoDeInicio(d, l)).map((d) => chaveDiaOficial(d))));
      })
      .catch((e) => {
        if (controle.signal.aborted) return;
        setEstado({ tipo: "erro", mensagem: e instanceof ErroApi ? e.message : "Não consegui ler o calendário agora." });
      });
    return () => controle.abort();
  }, [tribunal, ano, tentativa]);

  const todos = useMemo(() => (estado.tipo === "pronto" ? soOQueAcrescenta(estado.calendario.dias, tribunal) : []), [estado, tribunal]);
  const locais = useMemo(() => locaisDoCalendario(todos), [todos]);
  const dias = useMemo(() => filtrarPorLocal(todos, local), [todos, local]);
  const cadastrados = useMemo(() => jaCadastrados(dias, suspensoes, tribunal), [dias, suspensoes, tribunal]);
  const escolhidos = dias.filter((d) => {
    const k = chaveDiaOficial(d);
    return marcados.has(k) && !cadastrados.has(k);
  });

  const alternar = (k: string) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const escolherLocal = (l: string) => {
    setLocal(l);
    // Os dias da cidade escolhida já vêm marcados; o advogado desmarca o que não vale.
    if (l) setMarcados((m) => new Set([...m, ...todos.filter((d) => d.local === l).map(chaveDiaOficial)]));
    try {
      localStorage.setItem(chaveLocal(tribunal), l);
    } catch {
      // A escolha só não fica lembrada.
    }
  };

  const usar = () => {
    const novas = escolhidos.map((d) => ({ id: uid(), inicio: d.inicio, fim: d.fim, descricao: descricaoDoDia(d), tribunal }));
    salvarSuspensoes([...suspensoes, ...novas]);
    toast(`${novas.length} dia(s) do ${tribunal} no cálculo`, { descricao: "Os prazos em aberto foram recalculados. Você pode remover qualquer um na lista ao lado." });
  };

  const link = (
    <a href={calendarioOficial(tribunal)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
      Calendário oficial do {tribunal} <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );

  if (estado.tipo === "carregando") {
    return (
      <div className="border-b border-slate-100 px-5 py-4">
        <IaPensando compacto label={`Lendo o calendário oficial do ${tribunal}. Na primeira vez pode levar um minuto…`} />
      </div>
    );
  }
  if (estado.tipo === "desligado" || estado.tipo === "erro") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-800">
        <span className="flex-1">{estado.tipo === "erro" ? estado.mensagem : "A leitura do calendário pela IA não está ligada neste servidor."}</span>
        {estado.tipo === "erro" && (
          <button type="button" onClick={() => setTentativa((t) => t + 1)} className="inline-flex items-center gap-1 font-medium text-amber-900 hover:underline">
            <RotateCw className="h-3 w-3" aria-hidden /> Tentar de novo
          </button>
        )}
        {link}
      </div>
    );
  }

  const { calendario } = estado;
  return (
    <section className="border-b border-slate-100" aria-label={`Calendário do ${tribunal}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-4 text-xs text-slate-600">
        <p className="flex-1">
          <strong className="text-slate-800">
            Calendário do {tribunal} em {ano}
            {local && ` em ${local}`}
          </strong>
          : {dias.length ? `${dias.length} dia(s) além dos feriados nacionais e do recesso.` : "nenhum dia além dos feriados nacionais e do recesso."} Confira e marque os que valem para os seus processos.
        </p>
        {link}
      </div>
      {locais.length > 0 && (
        <div className="px-5 pt-3 sm:max-w-sm">
          <Field label="Cidade, comarca ou vara" htmlFor="dias-local" hint="Mostra os dias de todo o tribunal e os do lugar escolhido">
            <Select id="dias-local" value={local} onChange={(e) => escolherLocal(e.target.value)}>
              <option value="">Todos os lugares ({locais.length})</option>
              {locais.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      {dias.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100">
          {dias.map((d) => {
            const k = chaveDiaOficial(d);
            const ja = cadastrados.has(k);
            const lugar = <Badge className={d.local ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}>{d.local ?? NOMES_ABRANGENCIA[d.abrangencia]}</Badge>;
            return (
              <li key={k}>
                <label className="flex cursor-pointer items-start gap-3 px-5 py-2.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" checked={ja || marcados.has(k)} disabled={ja} onChange={() => alternar(k)} />
                  <span className="w-24 shrink-0 font-mono text-slate-700 sm:w-44">{periodo(d)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-slate-700">{d.descricao}</span>
                    {d.base && <span className="block text-xs text-slate-400">{d.base}</span>}
                    <span className="mt-1 block sm:hidden">{lugar}</span>
                  </span>
                  <span className="hidden sm:block">{lugar}</span>
                  {ja && (
                    <Badge className="bg-brand-50 text-brand-700">
                      <Check className="mr-0.5 inline h-3 w-3" aria-hidden />
                      no cálculo
                    </Badge>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-xs text-slate-500">
          Lido em {dataBR(calendario.lidoEm.slice(0, 10))} de{" "}
          {calendario.fontes.map((f, i) => (
            <span key={f}>
              {i > 0 && ", "}
              <a href={f} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-700">
                {new URL(f).hostname}
              </a>
            </span>
          ))}
          . A leitura é feita pela IA: confira no tribunal antes de contar um prazo.
        </p>
        {dias.length > 0 && (
          <Button onClick={usar} disabled={!escolhidos.length}>
            {escolhidos.length ? `Usar ${escolhidos.length} no cálculo` : "Nada novo marcado"}
          </Button>
        )}
      </div>
    </section>
  );
}
