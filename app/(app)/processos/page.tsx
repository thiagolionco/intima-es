"use client";

import clsx from "clsx";
import { CalendarDays, FolderOpen, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SeletorResponsavel, SeloResponsavel } from "@/components/equipe";
import { DialogoRetorno } from "@/components/central/dialogos";
import { AbasProcessos, ModalProtocolo, moverProcesso, SeloParticular, SeloPrescricao } from "@/components/quadro-processos";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, EmptyState, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { indiceEtapa } from "@/lib/fluxo/etapas";
import { AREA_LABEL, type AreaAtuacao, FASES, type FaseProcesso, type Processo, referencia, TIPO_DEMANDA_LABEL } from "@/lib/processos";
import { mensagemDeBloqueio } from "@/lib/use-fluxo";
import { useProcessos } from "@/lib/use-processos";
import { useStore } from "@/lib/store";
import { formatDate, formatProcesso, normalizar } from "@/lib/utils";

/** Colunas de trabalho; a última coluna recebe os que forem protocolados. */
const COLUNAS = FASES.filter((f) => f.id !== "protocolado");
const RECENTES_PROTOCOLADOS = 5;

/** Mais perto de prescrever primeiro; sem prescrição, os mexidos por último vão para o fim. */
function ordenar(a: Processo, b: Processo) {
  if (a.prescricao && b.prescricao) return a.prescricao.localeCompare(b.prescricao);
  if (a.prescricao || b.prescricao) return a.prescricao ? -1 : 1;
  return b.atualizadoEm.localeCompare(a.atualizadoEm);
}

function CartaoProcesso({ p, onMover, arrastando, onArrastar }: { p: Processo; onMover: (fase: FaseProcesso) => void; arrastando: boolean; onArrastar: (id?: string) => void }) {
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", p.id);
        e.dataTransfer.effectAllowed = "move";
        onArrastar(p.id);
      }}
      onDragEnd={() => onArrastar(undefined)}
      className={clsx("rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300", arrastando && "opacity-40")}
    >
      <Link href={`/processos/${p.id}`} className="block cursor-grab px-3 pb-2 pt-3 active:cursor-grabbing">
        <p className="text-sm font-semibold leading-snug text-slate-900">{referencia(p)}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.area && <Badge className="bg-brand-50 text-brand-700">{AREA_LABEL[p.area]}</Badge>}
          {p.tipo && <Badge>{TIPO_DEMANDA_LABEL[p.tipo]}</Badge>}
          <SeloPrescricao prescricao={p.prescricao} />
          <SeloParticular particular={p.particular} />
        </div>
        {p.numero && <p className="mt-2 truncate font-mono text-xs text-slate-500">{formatProcesso(p.numero)}</p>}
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
          <SeloResponsavel id={p.responsavelId} />
          {p.dataAtendimento && (
            <span className="inline-flex shrink-0 items-center gap-1" title="Data do atendimento">
              <CalendarDays className="h-3 w-3" aria-hidden />
              {formatDate(p.dataAtendimento)}
            </span>
          )}
        </div>
      </Link>
      <div className="border-t border-slate-100 px-3 py-1.5">
        <label className="sr-only" htmlFor={`fase-${p.id}`}>
          Mover {referencia(p)}
        </label>
        <select
          id={`fase-${p.id}`}
          value={p.fase}
          onChange={(e) => onMover(e.target.value as FaseProcesso)}
          className="w-full cursor-pointer rounded-md border-0 bg-transparent py-0.5 pl-0 text-xs text-slate-500 focus:ring-1 focus:ring-brand-600"
        >
          {FASES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.id === p.fase ? `Fase: ${f.rotulo}` : `Mover para ${f.rotulo}`}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}

export default function QuadroProcessosPage() {
  const { ready } = useStore();
  const { processos, erro, carregando, recarregar } = useProcessos();
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [area, setArea] = useState<AreaAtuacao | "">("");
  const [responsavel, setResponsavel] = useState<string>();
  /** Fase já mudada na tela enquanto o servidor grava. */
  const [movidos, setMovidos] = useState<Record<string, FaseProcesso>>({});
  const [arrastado, setArrastado] = useState<string>();
  const [sobre, setSobre] = useState<FaseProcesso>();
  const [protocolar, setProtocolar] = useState<Processo>();
  /** Voltar de etapa pede motivo, que fica no histórico do caso. */
  const [retorno, setRetorno] = useState<{ processo: Processo; para: FaseProcesso }>();

  const todos = useMemo(() => (processos ?? []).map((p) => (movidos[p.id] ? { ...p, fase: movidos[p.id] } : p)), [processos, movidos]);

  const filtrados = useMemo(() => {
    const termo = normalizar(busca.trim());
    return todos.filter(
      (p) =>
        (!termo || normalizar([p.cliente, p.parteContraria, p.numero, p.classe, p.comarca, p.observacoes].join(" ")).includes(termo)) &&
        (!area || p.area === area) &&
        (!responsavel || p.responsavelId === responsavel),
    );
  }, [todos, busca, area, responsavel]);

  const porFase = useMemo(() => {
    const m = Object.fromEntries(FASES.map((f) => [f.id, [] as Processo[]])) as Record<FaseProcesso, Processo[]>;
    for (const p of filtrados) m[p.fase].push(p);
    for (const f of COLUNAS) m[f.id].sort(ordenar);
    m.protocolado.sort((a, b) => (b.dataProtocolo ?? b.atualizadoEm).localeCompare(a.dataProtocolo ?? a.atualizadoEm));
    return m;
  }, [filtrados]);

  const emPreparacao = todos.filter((p) => p.fase !== "protocolado").length;

  async function mover(id: string, fase: FaseProcesso) {
    const p = todos.find((x) => x.id === id);
    if (!p || p.fase === fase) return;
    if (fase === "protocolado") return setProtocolar(p);
    if (indiceEtapa(fase) < indiceEtapa(p.fase)) return setRetorno({ processo: p, para: fase });
    await gravarMudanca(p, fase);
  }

  async function gravarMudanca(p: Processo, fase: FaseProcesso, motivo?: string) {
    const id = p.id;
    setMovidos((m) => ({ ...m, [id]: fase }));
    try {
      await moverProcesso(p, fase, motivo ? { motivo } : {});
      await recarregar();
    } catch (e) {
      toast(mensagemDeBloqueio(e, "Não foi possível mover."), { tom: "error" });
    } finally {
      setMovidos(({ [id]: _, ...resto }) => resto);
    }
  }

  const acao = (
    <Link href="/processos/novo">
      <Button icon={<Plus className="h-4 w-4" />}>Novo caso</Button>
    </Link>
  );

  return (
    <>
      <PageHeader title="Processos" description="Do atendimento ao protocolo: arraste o cartão para mudar a fase." actions={acao} />
      <AbasProcessos atual="andamento" contagem={processos ? { andamento: emPreparacao, protocolados: todos.length - emPreparacao } : undefined} />
      {erro && <Alert>{erro}</Alert>}
      {!ready || carregando ? (
        <Spinner />
      ) : !processos?.length ? (
        !erro && (
          <Card>
            <EmptyState
              icon={<FolderOpen className="h-6 w-6" />}
              title="Nenhum caso ainda"
              description="Cadastre um atendimento para acompanhar a triagem, a peça e o protocolo, com a prescrição à vista."
              action={acao}
            />
          </Card>
        )
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:max-w-sm sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por cliente, parte ou número" className="pl-9" aria-label="Buscar casos" />
            </div>
            <Select value={area} onChange={(e) => setArea(e.target.value as AreaAtuacao | "")} className="sm:w-48" aria-label="Filtrar por área">
              <option value="">Todas as áreas</option>
              {(Object.keys(AREA_LABEL) as AreaAtuacao[]).map((a) => (
                <option key={a} value={a}>
                  {AREA_LABEL[a]}
                </option>
              ))}
            </Select>
            <SeletorResponsavel value={responsavel} onChange={(id) => setResponsavel(id ?? undefined)} rotuloVazio="Todos os responsáveis" className="sm:w-60" aria-label="Filtrar por responsável" />
          </div>

          <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
            <div className="flex min-w-max gap-4 lg:grid lg:min-w-0 lg:grid-cols-4">
              {FASES.map((f) => {
                const lista = porFase[f.id];
                const visiveis = f.id === "protocolado" ? lista.slice(0, RECENTES_PROTOCOLADOS) : lista;
                return (
                  <section
                    key={f.id}
                    aria-label={f.rotulo}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setSobre(f.id);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre(undefined);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setSobre(undefined);
                      const id = e.dataTransfer.getData("text/plain");
                      if (id) void mover(id, f.id);
                    }}
                    className={clsx(
                      "flex w-72 shrink-0 flex-col rounded-2xl bg-slate-100/70 p-3 transition lg:w-auto",
                      sobre === f.id && "bg-brand-50 ring-2 ring-brand-300",
                      f.id === "protocolado" && "bg-emerald-50/60",
                    )}
                  >
                    <header className="mb-3 flex items-baseline justify-between gap-2 px-1">
                      <h2 className="text-sm font-semibold text-slate-800">{f.rotulo}</h2>
                      <span className="text-xs text-slate-500">{lista.length}</span>
                    </header>
                    <ul className="flex min-h-24 flex-1 flex-col gap-2">
                      {visiveis.map((p) => (
                        <CartaoProcesso key={p.id} p={p} onMover={(fase) => void mover(p.id, fase)} arrastando={arrastado === p.id} onArrastar={setArrastado} />
                      ))}
                      {!lista.length && <li className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">{f.descricao}</li>}
                    </ul>
                    {f.id === "protocolado" && lista.length > 0 && (
                      <Link href="/processos/protocolados" className="mt-3 px-1 text-xs font-medium text-brand-700 hover:underline">
                        {lista.length > RECENTES_PROTOCOLADOS ? `Ver todos os ${lista.length} na aba Protocolados` : "Abrir a aba Protocolados"}
                      </Link>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </>
      )}
      <DialogoRetorno
        linha={retorno && { processo: retorno.processo, referencia: referencia(retorno.processo) }}
        paraInicial={retorno?.para}
        onFechar={() => setRetorno(undefined)}
        onConfirmar={async (para, motivo) => {
          const p = retorno!.processo;
          setRetorno(undefined);
          await gravarMudanca(p, para, motivo);
        }}
      />
      <ModalProtocolo
        processo={protocolar}
        onFechar={() => setProtocolar(undefined)}
        onProtocolado={(p) => {
          setProtocolar(undefined);
          toast("Processo protocolado", { descricao: referencia(p) });
          void recarregar();
        }}
      />
    </>
  );
}
