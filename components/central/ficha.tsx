"use client";

import clsx from "clsx";
import { AlertTriangle, ArrowUpRight, Check, Lock, NotebookPen, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SeletorResponsavel } from "@/components/equipe";
import { SeloPrescricao } from "@/components/quadro-processos";
import { Button, Input, Textarea } from "@/components/ui";
import { api } from "@/lib/auth/api";
import { DatePicker } from "@/components/date-picker";
import { itensDaEtapa, type ItemAvaliado } from "@/lib/fluxo/checklist";
import type { LinhaCaso } from "@/lib/fluxo/consulta";
import { ETAPAS, etapa, etapaAnterior, indiceEtapa, modeloDoItem } from "@/lib/fluxo/etapas";
import type { EventoFluxo } from "@/lib/fluxo/modelo";
import type { Avaliacao } from "@/lib/fluxo/motor";
import { AREA_LABEL, LIMITES_PROCESSO, mascaraCNJ, type ParecerProcesso, type Processo, TIPO_DEMANDA_LABEL } from "@/lib/processos";
import { apiFluxo } from "@/lib/use-fluxo";
import { formatDateTime, hojeISO } from "@/lib/utils";
import { COR_ETAPA, Kbd } from "./selos";

interface Props {
  linha: LinhaCaso;
  avanco?: Avaliacao & { para: Processo["fase"] };
  ocupado: boolean;
  onFechar: () => void;
  onAvancar: () => void;
  onVoltar: () => void;
  onMarcar: (item: string, feito: boolean) => void;
  onCampos: (campos: Partial<Processo>) => Promise<void>;
}

/** Linha do tempo de cada etapa já vivida: quando entrou, a partir dos eventos. */
function entradas(eventos: EventoFluxo[]) {
  const m = new Map<string, string>();
  for (const e of [...eventos].reverse()) if ((e.tipo === "avanco" || e.tipo === "retorno") && e.para) m.set(e.para, e.criadoEm);
  return m;
}

function Trilha({ linha, eventos }: { linha: LinhaCaso; eventos: EventoFluxo[] }) {
  const atual = indiceEtapa(linha.processo.fase);
  const entrou = entradas(eventos);
  return (
    <ol className="flex items-start" aria-label="Etapas do caso">
      {ETAPAS.map((e, i) => {
        const feita = i < atual;
        const corrente = i === atual;
        return (
          <li key={e.id} className="flex-1 text-center" aria-current={corrente ? "step" : undefined}>
            <div className="flex items-center">
              <span className={clsx("h-0.5 flex-1", i === 0 ? "invisible" : i <= atual ? "bg-emerald-500" : "bg-slate-200")} />
              <span
                className={clsx(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  feita && "bg-emerald-600 text-white",
                  corrente && clsx(COR_ETAPA[e.id].ponto, "text-white ring-4 ring-slate-100"),
                  !feita && !corrente && "bg-white text-slate-400 ring-2 ring-inset ring-slate-300",
                )}
              >
                {feita ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={clsx("h-0.5 flex-1", i === ETAPAS.length - 1 ? "invisible" : i < atual ? "bg-emerald-500" : "bg-slate-200")} />
            </div>
            <p className={clsx("mt-1 truncate px-0.5 text-[11px]", corrente ? "font-semibold text-slate-900" : feita ? "font-medium text-slate-700" : "text-slate-500")}>{e.rotulo.split(" ")[0]}</p>
            <p className={clsx("text-[10px]", corrente && linha.prazo === "estourado" ? "font-semibold text-red-600" : "text-slate-400")}>
              {corrente
                ? e.prazoDias
                  ? `${linha.diasNaEtapa} de ${e.prazoDias} dias`
                  : `há ${linha.diasNaEtapa} dias`
                : feita
                  ? entrou.get(e.id)
                    ? new Date(entrou.get(e.id)!).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                    : "concluída"
                  : e.prazoDias
                    ? `prazo ${e.prazoDias}`
                    : " "}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function ItemChecklist({ item, onMarcar, desabilitado }: { item: ItemAvaliado; onMarcar: (feito: boolean) => void; desabilitado: boolean }) {
  const id = `item-${item.id}`;
  return (
    <li className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={item.feito}
        disabled={desabilitado || Boolean(item.automatico)}
        onChange={(e) => onMarcar(e.target.checked)}
        className={clsx("mt-0.5 h-4 w-4 rounded border-slate-300 focus:ring-brand-600 disabled:cursor-not-allowed", item.automatico ? "text-emerald-500" : "text-brand-600", !item.feito && item.bloqueante && "border-red-300")}
      />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className={clsx("block text-[13px]", item.feito ? "text-slate-500" : "text-slate-800", item.feito && !item.automatico && "line-through decoration-slate-300")}>{item.rotulo}</span>
        {!item.feito && item.dica && <span className="block text-[11px] text-slate-400">{item.dica}</span>}
      </label>
      {item.automatico ? (
        <span className={clsx("shrink-0 text-[10px]", item.feito ? "text-emerald-700" : "text-slate-400")} title="Conferido pelos dados do cadastro">
          automático
        </span>
      ) : item.feito && item.marca ? (
        <span className="shrink-0 text-[10px] text-slate-400" title={`Marcado por ${item.marca.porNome} em ${formatDateTime(item.marca.em)}`}>
          {item.marca.porNome.split(" ")[0]} · {new Date(item.marca.em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
        </span>
      ) : item.bloqueante ? (
        <span className="shrink-0 rounded bg-red-50 px-1.5 text-[10px] font-semibold text-red-700">obrigatório</span>
      ) : null}
    </li>
  );
}

function textoEvento(e: EventoFluxo) {
  if (e.tipo === "avanco") return `avançou de ${etapa(e.de!).rotulo} para ${etapa(e.para!).rotulo}`;
  if (e.tipo === "retorno") return `voltou de ${etapa(e.de!).rotulo} para ${etapa(e.para!).rotulo}`;
  const item = e.item ? (modeloDoItem(e.item)?.item.rotulo ?? e.item) : "item";
  return `${e.tipo === "item_marcado" ? "marcou" : "desmarcou"} “${item}”`;
}

const PONTO_EVENTO: Record<EventoFluxo["tipo"], string> = { avanco: "bg-emerald-600", retorno: "bg-amber-500", item_marcado: "bg-brand-600", item_desmarcado: "bg-slate-400" };

/** Número e data do protocolo direto na ficha, quando são o que falta para protocolar. */
function DadosProtocolo({ p, onCampos }: { p: Processo; onCampos: Props["onCampos"] }) {
  const [numero, setNumero] = useState(mascaraCNJ(p.numero ?? ""));
  const [data, setData] = useState(p.dataProtocolo ?? hojeISO());
  const [salvando, setSalvando] = useState(false);
  return (
    <form
      className="mt-2 space-y-2 rounded-lg bg-white p-2 ring-1 ring-slate-200"
      onSubmit={async (e) => {
        e.preventDefault();
        setSalvando(true);
        try {
          await onCampos({ numero, dataProtocolo: data });
        } finally {
          setSalvando(false);
        }
      }}
    >
      <Input aria-label="Número CNJ" placeholder="0000000-00.0000.0.00.0000" className="font-mono text-xs" inputMode="numeric" value={numero} onChange={(e) => setNumero(mascaraCNJ(e.target.value))} />
      <div className="flex gap-2">
        <DatePicker id={`data-protocolo-${p.id}`} value={data} onChange={setData} />
        <Button size="sm" type="submit" loading={salvando}>
          Salvar
        </Button>
      </div>
    </form>
  );
}

/** Observação do caso (o campo Observações do cadastro), editável ali mesmo, e o começo do último parecer. */
function Observacao({ p, onCampos }: { p: Processo; onCampos: Props["onCampos"] }) {
  const [texto, setTexto] = useState(p.observacoes ?? "");
  const [salvando, setSalvando] = useState(false);
  const [parecer, setParecer] = useState<ParecerProcesso | null>();
  const mudou = texto.trim() !== (p.observacoes ?? "").trim();
  const excedeu = texto.length > LIMITES_PROCESSO.observacoes;

  useEffect(() => setTexto(p.observacoes ?? ""), [p.id, p.observacoes]);

  useEffect(() => {
    const controle = new AbortController();
    setParecer(undefined);
    api<{ pareceres: ParecerProcesso[] }>(`/api/processos/${encodeURIComponent(p.id)}/pareceres`, { signal: controle.signal })
      .then((r) => setParecer(r.pareceres[0] ?? null))
      .catch(() => !controle.signal.aborted && setParecer(null));
    return () => controle.abort();
  }, [p.id]);

  async function salvar() {
    setSalvando(true);
    try {
      await onCampos({ observacoes: texto.trim() || undefined });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="border-b border-slate-100 px-5 py-4">
      <label htmlFor={`obs-${p.id}`} className="mb-2 block text-xs font-semibold text-slate-700">
        Observação
      </label>
      <Textarea
        id={`obs-${p.id}`}
        rows={3}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Anotações do escritório sobre o caso…"
        invalid={excedeu}
        className="text-[13px]"
      />
      {(mudou || excedeu) && (
        <div className="mt-2 flex items-center justify-end gap-2">
          {excedeu && <span className="mr-auto text-[11px] text-red-600">No máximo {LIMITES_PROCESSO.observacoes} caracteres.</span>}
          <Button size="sm" variant="secondary" type="button" disabled={salvando} onClick={() => setTexto(p.observacoes ?? "")}>
            Desfazer
          </Button>
          <Button size="sm" type="button" loading={salvando} disabled={excedeu} onClick={() => void salvar()}>
            Salvar
          </Button>
        </div>
      )}

      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <NotebookPen className="h-3.5 w-3.5" aria-hidden />
            Último parecer
          </p>
          <Link href={`/processos/${p.id}?aba=parecer`} className="text-[11px] font-medium text-brand-700 hover:underline">
            {parecer ? "Ler inteiro" : "Escrever"}
          </Link>
        </div>
        {parecer === undefined ? (
          <p className="mt-1 text-xs text-slate-400">Carregando…</p>
        ) : !parecer ? (
          <p className="mt-1 text-xs text-slate-400">Nenhum parecer escrito ainda.</p>
        ) : (
          <>
            <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">{parecer.texto}</p>
            <p className="mt-1 text-[10px] text-slate-400">
              Versão {parecer.versao} · {parecer.autorNome} · {formatDateTime(parecer.criadoEm)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** Ficha do caso ao lado da grade: portões, checklist, responsável e trilha de auditoria. */
export function FichaCaso({ linha, avanco, ocupado, onFechar, onAvancar, onVoltar, onMarcar, onCampos }: Props) {
  const p = linha.processo;
  const [eventos, setEventos] = useState<EventoFluxo[]>();
  const itens = itensDaEtapa(p, linha.fluxo);
  const ultima = !avanco;
  const anterior = etapaAnterior(p.fase);
  const camposFaltando = avanco?.bloqueios.filter((b) => b.campo) ?? [];
  const pendentesItens = avanco?.bloqueios.filter((b) => b.item).length ?? 0;
  const precisaProtocolo = camposFaltando.some((b) => b.campo === "numero" || b.campo === "dataProtocolo");

  useEffect(() => {
    const controle = new AbortController();
    apiFluxo
      .ficha(p.id, controle.signal)
      .then((r) => setEventos(r.eventos))
      .catch(() => !controle.signal.aborted && setEventos([]));
    return () => controle.abort();
  }, [p.id, linha.fluxo.versao, p.fase]);

  return (
    <aside aria-label={`Ficha de ${linha.referencia}`} className="flex max-h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-sm shadow-card">
      <div className="border-b border-slate-100 px-5 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Ficha do caso</p>
          <div className="flex items-center gap-1">
            <Link href={`/processos/${p.id}`} className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              Abrir completo <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
            <button type="button" onClick={onFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar a ficha (Esc)">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <h2 className="mt-1 text-base font-semibold leading-snug text-slate-900">{linha.referencia}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.area && <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{AREA_LABEL[p.area]}</span>}
          {p.tipo && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{TIPO_DEMANDA_LABEL[p.tipo]}</span>}
          {p.fase !== "protocolado" && <SeloPrescricao prescricao={p.prescricao} />}
        </div>
      </div>

      <div className="overflow-y-auto">
        <div className="border-b border-slate-100 px-5 py-4">
          <Trilha linha={linha} eventos={eventos ?? []} />
          <div className="mt-4 flex gap-2">
            {!ultima && (
              <button
                type="button"
                onClick={onAvancar}
                disabled={ocupado || !avanco.permitido}
                className={clsx(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                  avanco.permitido ? "bg-brand-600 text-white shadow-sm hover:bg-brand-700" : "cursor-not-allowed bg-slate-100 text-slate-500",
                )}
              >
                {avanco.permitido ? (
                  <>
                    Avançar para {etapa(avanco.para).rotulo.split(" ")[0]} <Kbd escuro>]</Kbd>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" aria-hidden />
                    Avançar · {avanco.bloqueios.length} pendência{avanco.bloqueios.length > 1 ? "s" : ""}
                  </>
                )}
              </button>
            )}
            {anterior && (
              <button type="button" onClick={onVoltar} disabled={ocupado} className={clsx("inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50", ultima && "flex-1")}>
                <Undo2 className="h-4 w-4" aria-hidden />
                Voltar
              </button>
            )}
          </div>
          {avanco && avanco.avisos.length > 0 && (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {avanco.avisos.map((a) => a.mensagem).join(" ")}
            </p>
          )}
          {camposFaltando.length > 0 && (
            <div className="mt-3 rounded-lg bg-red-50/70 px-3 py-2 text-xs text-red-800">
              <p className="font-semibold">Falta no cadastro</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {camposFaltando.map((b) => (
                  <li key={b.mensagem}>{b.mensagem}</li>
                ))}
              </ul>
              {precisaProtocolo ? (
                <DadosProtocolo p={p} onCampos={onCampos} />
              ) : (
                camposFaltando.some((b) => b.campo === "area" || b.campo === "tipo") && (
                  <Link href={`/processos/${p.id}/editar`} className="mt-1 inline-block font-medium underline">
                    Editar o cadastro
                  </Link>
                )
              )}
            </div>
          )}
        </div>

        <div className="border-b border-slate-100 px-5 py-4">
          <div className="mb-2 flex justify-between">
            <p className="text-xs font-semibold text-slate-700">Checklist · {etapa(p.fase).rotulo}</p>
            <p className="text-xs tabular-nums text-slate-500">
              {linha.checklist.feitos} de {linha.checklist.total}
            </p>
          </div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className={clsx("h-full rounded-full transition-all", linha.checklist.feitos === linha.checklist.total ? "bg-emerald-500" : "bg-brand-600")} style={{ width: `${linha.checklist.total ? (linha.checklist.feitos / linha.checklist.total) * 100 : 0}%` }} />
          </div>
          <ul className="space-y-2">
            {itens.map((i) => (
              <ItemChecklist key={i.id} item={i} desabilitado={ocupado} onMarcar={(feito) => onMarcar(i.id, feito)} />
            ))}
          </ul>
          {pendentesItens > 0 && <p className="mt-3 text-[11px] text-slate-400">Os itens obrigatórios liberam o avanço para a próxima etapa.</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <label htmlFor={`resp-${p.id}`} className="text-[13px] text-slate-500">
            Responsável
          </label>
          <SeletorResponsavel id={`resp-${p.id}`} value={p.responsavelId} onChange={(id) => void onCampos({ responsavelId: id ?? undefined })} className="w-48 py-1.5 text-[13px]" />
        </div>

        <Observacao p={p} onCampos={onCampos} />

        <div className="px-5 py-4">
          <p className="mb-3 text-xs font-semibold text-slate-700">
            Histórico <span className="font-normal text-slate-400">· registro permanente</span>
          </p>
          {!eventos ? (
            <p className="text-xs text-slate-400">Carregando…</p>
          ) : !eventos.length ? (
            <p className="text-xs text-slate-400">Nada registrado na Central ainda. Cada marcação e mudança de etapa aparece aqui, com autor e horário.</p>
          ) : (
            <ol className="relative ml-1.5 space-y-3 border-l border-slate-200 text-xs">
              {eventos.map((e) => (
                <li key={e.id} className="relative pl-4">
                  <span className={clsx("absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white", PONTO_EVENTO[e.tipo])} aria-hidden />
                  <p className="text-slate-700">
                    <b className="font-medium text-slate-900">{e.autorNome}</b> {textoEvento(e)}
                  </p>
                  {e.motivo && <p className="mt-0.5 rounded bg-amber-50 px-2 py-1 text-amber-900">“{e.motivo}”</p>}
                  <p className="text-slate-400">{formatDateTime(e.criadoEm)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </aside>
  );
}
