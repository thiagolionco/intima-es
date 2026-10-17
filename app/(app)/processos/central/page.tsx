"use client";

import { ArrowRight, Check, Command, FileDown, FolderOpen, Layers, ListFilter, Plus, Undo2, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarraConsulta } from "@/components/central/barra-consulta";
import { DialogoAtribuir, DialogoAvancoLote, DialogoRetorno, type PreviaLote } from "@/components/central/dialogos";
import { Esteira } from "@/components/central/esteira";
import { FichaCaso } from "@/components/central/ficha";
import { GradeCasos } from "@/components/central/grade";
import { type Comando, PaletaComandos } from "@/components/central/paleta";
import { Kbd, SiglaEtapa } from "@/components/central/selos";
import { gravarVisoesSalvas, lerVisoesSalvas, PainelVisoes, SeletorVisoes } from "@/components/central/visoes";
import { AbasProcessos } from "@/components/quadro-processos";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { ErroApi } from "@/lib/auth/api";
import { itensDaEtapa } from "@/lib/fluxo/checklist";
import { type Agrupamento, agrupar, aplicar, type Coluna, type LinhaCaso, lerConsulta, montarLinhas, type Ordem, ordenar, resumoDaEsteira, VISOES_PADRAO, type Visao } from "@/lib/fluxo/consulta";
import { etapa, etapaAnterior } from "@/lib/fluxo/etapas";
import type { FluxoProcesso } from "@/lib/fluxo/modelo";
import { motorPadrao } from "@/lib/fluxo/motor";
import { AREA_LABEL, type FaseProcesso, formatarValor, type Processo, TIPO_DEMANDA_LABEL } from "@/lib/processos";
import { useStore } from "@/lib/store";
import { apiFluxo, type ResultadoLote, useFluxo } from "@/lib/use-fluxo";
import { formatDate, formatProcesso, hojeISO, uid } from "@/lib/utils";

const CONSULTA_PADRAO = "-etapa:protocolado";
const ORDEM_PADRAO: Ordem = { coluna: "prescricao", direcao: "asc" };

const mensagem = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível salvar.");

/** Campo de texto com foco: as teclas de atalho não podem atrapalhar a digitação. */
function digitando(alvo: EventTarget | null) {
  const el = alvo as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)));
}

function baixarCsv(linhas: LinhaCaso[], nomeDe: (id: string) => string | undefined) {
  const cel = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cab = ["Cliente", "Parte contrária", "Número", "Etapa", "Dias na etapa", "Prazo da etapa", "Checklist", "Prescrição", "Área", "Tipo", "Responsável", "Valor da causa"];
  const corpo = linhas.map((l) => {
    const p = l.processo;
    return [
      p.cliente,
      p.parteContraria,
      p.numero ? formatProcesso(p.numero) : "",
      etapa(p.fase).rotulo,
      l.diasNaEtapa,
      etapa(p.fase).prazoDias ?? "",
      `${l.checklist.feitos}/${l.checklist.total}`,
      p.prescricao ? formatDate(p.prescricao) : "",
      p.area ? AREA_LABEL[p.area] : "",
      p.tipo ? TIPO_DEMANDA_LABEL[p.tipo] : "",
      p.responsavelId ? (nomeDe(p.responsavelId) ?? "") : "",
      formatarValor(p.valorCausa),
    ].map(cel);
  });
  const csv = "﻿" + [cab, ...corpo].map((l) => l.join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `central-de-casos-${hojeISO()}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

function Central() {
  const router = useRouter();
  const params = useSearchParams();
  const { ready, equipe } = useStore();
  const { processos, fluxos, erro, carregando, recarregar, aplicar: aplicarLocal } = useFluxo();
  const { toast } = useToast();

  const [consulta, setConsulta] = useState(() => params.get("q") ?? CONSULTA_PADRAO);
  const [agrupamento, setAgrupamento] = useState<Agrupamento>(() => (["etapa", "responsavel", "area", "nenhum"].includes(params.get("agrupar") ?? "") ? (params.get("agrupar") as Agrupamento) : "etapa"));
  const [ordem, setOrdem] = useState<Ordem>(ORDEM_PADRAO);
  const [aberto, setAberto] = useState<string | undefined>(() => params.get("caso") ?? undefined);
  const [cursor, setCursor] = useState<string>();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [ancora, setAncora] = useState<string>();
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set(["protocolado"]));
  const [salvas, setSalvas] = useState<Visao[]>([]);
  const [paleta, setPaleta] = useState(false);
  const [retorno, setRetorno] = useState<LinhaCaso>();
  const [lote, setLote] = useState<{ previa: PreviaLote[]; resultados?: ResultadoLote[] }>();
  const [atribuindo, setAtribuindo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const busca = useRef<HTMLInputElement>(null);

  useEffect(() => setSalvas(lerVisoesSalvas()), []);

  // A URL guarda filtro, agrupamento e caso aberto: dá para voltar ou mandar o link a um colega.
  useEffect(() => {
    const u = new URLSearchParams();
    if (consulta !== CONSULTA_PADRAO) u.set("q", consulta);
    if (agrupamento !== "etapa") u.set("agrupar", agrupamento);
    if (aberto) u.set("caso", aberto);
    const qs = u.toString();
    router.replace(`/processos/central${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [consulta, agrupamento, aberto, router]);

  const nomeDe = useCallback((id: string) => equipe.find((p) => p.id === id)?.nome, [equipe]);
  const pessoas = useMemo(() => equipe.map((p) => ({ id: p.id, nome: p.nome })), [equipe]);

  const linhas = useMemo(() => (processos ? montarLinhas(processos, fluxos, motorPadrao, new Date(), hojeISO()) : []), [processos, fluxos]);
  const lida = useMemo(() => lerConsulta(consulta), [consulta]);
  const grupos = useMemo(() => agrupar(ordenar(aplicar(linhas, lida, pessoas), ordem, nomeDe), agrupamento, nomeDe), [linhas, lida, pessoas, ordem, nomeDe, agrupamento]);
  const visiveis = useMemo(() => grupos.filter((g) => !recolhidos.has(g.chave)).flatMap((g) => g.linhas), [grupos, recolhidos]);
  const totalFiltrado = grupos.reduce((n, g) => n + g.linhas.length, 0);
  const resumo = useMemo(() => resumoDaEsteira(linhas), [linhas]);
  const porId = useMemo(() => new Map(linhas.map((l) => [l.processo.id, l])), [linhas]);
  const linhaAberta = aberto ? porId.get(aberto) : undefined;
  const avancoAberto = linhaAberta ? motorPadrao.avaliarAvanco(linhaAberta.processo, linhaAberta.fluxo, hojeISO()) : undefined;
  const etapaFiltrada = lida.filtros.flatMap((f) => (f.tipo === "etapa" && !f.negado ? [f.valor] : []))[0];
  const emPreparacao = linhas.filter((l) => l.processo.fase !== "protocolado").length;

  // Um caso aberto que sumiu (excluído em outra aba) fecha a ficha.
  useEffect(() => {
    if (processos && aberto && !porId.has(aberto)) setAberto(undefined);
  }, [processos, aberto, porId]);

  /* ---------- Ações ---------- */

  const tratarErro = useCallback(
    (e: unknown) => {
      toast(mensagem(e), { tom: "error" });
      if (e instanceof ErroApi && (e.codigo === "conflito" || e.codigo === "transicao_bloqueada")) void recarregar();
    },
    [toast, recarregar],
  );

  async function transicionar(l: LinhaCaso, para: FaseProcesso, motivo?: string) {
    setOcupado(true);
    try {
      const r = await apiFluxo.transicionar(l.processo.id, para, l.fluxo.versao, motivo);
      aplicarLocal(r.processo, r.fluxo);
      toast(motivo ? `Voltou para ${etapa(para).rotulo}` : `Avançou para ${etapa(para).rotulo}`, { descricao: l.referencia, tom: motivo ? "info" : "success" });
      return true;
    } catch (e) {
      tratarErro(e);
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function marcar(l: LinhaCaso, item: string, feito: boolean) {
    // Otimista: a caixa responde na hora; se o servidor recusar, a tela volta ao que ele tem.
    const checklist = { ...l.fluxo.checklist };
    if (feito) checklist[item] = { por: "", porNome: "Você", em: new Date().toISOString() };
    else delete checklist[item];
    const otimista: FluxoProcesso = { ...l.fluxo, checklist };
    aplicarLocal(undefined, otimista);
    setOcupado(true);
    try {
      const r = await apiFluxo.marcar(l.processo.id, item, feito, l.fluxo.versao);
      aplicarLocal(undefined, r.fluxo);
    } catch (e) {
      aplicarLocal(undefined, l.fluxo);
      tratarErro(e);
    } finally {
      setOcupado(false);
    }
  }

  async function salvarCampos(p: Processo, campos: Partial<Processo>) {
    try {
      const r = await apiFluxo.salvarCampos(p, campos);
      aplicarLocal(r.processo);
      toast("Cadastro atualizado", { descricao: porId.get(p.id)?.referencia });
    } catch (e) {
      tratarErro(e);
    }
  }

  /** Avançar: um caso pronto vai direto; vários (ou um com pendências) passam pela prévia. */
  function avancar(ids: string[]) {
    const ls = ids.map((id) => porId.get(id)).filter((l): l is LinhaCaso => Boolean(l));
    if (!ls.length) return;
    if (ls.length === 1) {
      const l = ls[0];
      const a = motorPadrao.avaliarAvanco(l.processo, l.fluxo, hojeISO());
      if (!a) return toast("Este caso já está na última etapa.", { tom: "info" });
      if (a.permitido) return void transicionar(l, a.para);
      setAberto(l.processo.id);
      return toast(`${a.bloqueios.length} pendência(s) para avançar`, { descricao: a.bloqueios[0].mensagem, tom: "error" });
    }
    setLote({ previa: ls.map((l) => ({ linha: l, avaliacao: motorPadrao.avaliarAvanco(l.processo, l.fluxo, hojeISO()) })) });
  }

  function voltar(id?: string) {
    const l = id ? porId.get(id) : undefined;
    if (!l) return;
    if (!etapaAnterior(l.processo.fase)) return toast("Este caso já está na primeira etapa.", { tom: "info" });
    setRetorno(l);
  }

  function alternar(id: string, comShift: boolean) {
    setSelecionados((s) => {
      const novo = new Set(s);
      if (comShift && ancora) {
        const ids = visiveis.map((l) => l.processo.id);
        const [a, b] = [ids.indexOf(ancora), ids.indexOf(id)].sort((x, y) => x - y);
        if (a >= 0) for (const x of ids.slice(a, b + 1)) novo.add(x);
      } else if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
    setAncora(id);
  }

  function ordenarPor(c: Coluna) {
    setOrdem((o) => (o.coluna === c ? { coluna: c, direcao: o.direcao === "asc" ? "desc" : "asc" } : { coluna: c, direcao: "asc" }));
  }

  function filtrarEtapa(f: FaseProcesso) {
    setConsulta(etapaFiltrada === f ? CONSULTA_PADRAO : `etapa:${f}`);
    setRecolhidos((r) => {
      const n = new Set(r);
      n.delete(f);
      return n;
    });
  }

  const alvo = selecionados.size ? [...selecionados] : (aberto ?? cursor) ? [(aberto ?? cursor)!] : [];

  /* ---------- Teclado ---------- */

  const teclado = useRef<(e: KeyboardEvent) => void>(() => {});
  teclado.current = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setPaleta((p) => !p);
      return;
    }
    if (paleta || retorno || lote || atribuindo || digitando(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
    const ids = visiveis.map((l) => l.processo.id);
    const atual = cursor ?? aberto;
    const mover = (d: number) => {
      if (!ids.length) return;
      const i = atual ? ids.indexOf(atual) : -1;
      const prox = ids[Math.max(0, Math.min(ids.length - 1, i < 0 ? 0 : i + d))];
      setCursor(prox);
      if (aberto) setAberto(prox);
    };
    switch (e.key) {
      case "j":
      case "ArrowDown":
        e.preventDefault();
        return mover(1);
      case "k":
      case "ArrowUp":
        e.preventDefault();
        return mover(-1);
      case "x":
        if (atual) alternar(atual, e.shiftKey);
        return;
      case "Enter":
      case "o":
        if (cursor) setAberto(cursor);
        return;
      case "]":
        return avancar(alvo);
      case "[":
        return voltar(aberto ?? cursor);
      case "a":
        if (alvo.length) {
          if (!selecionados.size) setSelecionados(new Set(alvo));
          setAtribuindo(true);
        }
        return;
      case "/":
        e.preventDefault();
        busca.current?.focus();
        return;
      case "Escape":
        if (aberto) setAberto(undefined);
        else if (selecionados.size) setSelecionados(new Set());
        return;
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => teclado.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  /* ---------- Paleta ---------- */

  const comandos = useMemo<Comando[]>(() => {
    const lista: Comando[] = linhas.map((l) => ({
      id: `caso-${l.processo.id}`,
      grupo: "Casos",
      rotulo: l.referencia,
      busca: `${l.processo.numero ?? ""} ${l.processo.classe ?? ""}`,
      icone: <SiglaEtapa fase={l.processo.fase} />,
      detalhe: l.processo.numero ? <span className="font-mono">{formatProcesso(l.processo.numero)}</span> : etapa(l.processo.fase).rotulo,
      executar: () => {
        setAberto(l.processo.id);
        setCursor(l.processo.id);
      },
    }));
    const foco = linhaAberta ?? (cursor ? porId.get(cursor) : undefined);
    if (foco) {
      const g = `Ações em “${foco.referencia.length > 40 ? `${foco.referencia.slice(0, 40)}…` : foco.referencia}”`;
      const a = motorPadrao.avaliarAvanco(foco.processo, foco.fluxo, hojeISO());
      if (a)
        lista.push({
          id: "avancar",
          grupo: g,
          rotulo: `Avançar para ${etapa(a.para).rotulo}`,
          icone: <ArrowRight className="h-4 w-4" />,
          detalhe: a.permitido ? undefined : <span className="text-red-600">{a.bloqueios.length} pendência(s)</span>,
          atalho: "]",
          executar: () => avancar([foco.processo.id]),
        });
      if (etapaAnterior(foco.processo.fase)) lista.push({ id: "voltar", grupo: g, rotulo: "Voltar de etapa…", icone: <Undo2 className="h-4 w-4" />, atalho: "[", executar: () => voltar(foco.processo.id) });
      for (const item of itensDaEtapa(foco.processo, foco.fluxo).filter((i) => !i.automatico)) {
        lista.push({
          id: `item-${item.id}`,
          grupo: g,
          rotulo: `${item.feito ? "Desmarcar" : "Marcar"} “${item.rotulo}”`,
          icone: <Check className="h-4 w-4" />,
          executar: () => void marcar(foco, item.id, !item.feito),
        });
      }
      lista.push({
        id: "atribuir",
        grupo: g,
        rotulo: "Atribuir a…",
        icone: <UserRound className="h-4 w-4" />,
        atalho: "A",
        executar: () => {
          setSelecionados(new Set([foco.processo.id]));
          setAtribuindo(true);
        },
      });
    }
    for (const v of [...VISOES_PADRAO, ...salvas])
      lista.push({ id: `visao-${v.id}`, grupo: "Ir para", rotulo: `Visão: ${v.rotulo}`, icone: <ListFilter className="h-4 w-4" />, detalhe: `${aplicar(linhas, lerConsulta(v.consulta), pessoas).length} casos`, executar: () => setConsulta(v.consulta) });
    for (const [a, r] of [
      ["etapa", "Etapa"],
      ["responsavel", "Responsável"],
      ["area", "Área"],
      ["nenhum", "Nada"],
    ] as const)
      lista.push({ id: `agrupar-${a}`, grupo: "Ir para", rotulo: `Agrupar por: ${r}`, icone: <Layers className="h-4 w-4" />, executar: () => setAgrupamento(a) });
    lista.push({ id: "exportar", grupo: "Ir para", rotulo: "Exportar a grade em CSV", icone: <FileDown className="h-4 w-4" />, executar: () => baixarCsv(visiveis, nomeDe) });
    lista.push({ id: "novo", grupo: "Ir para", rotulo: "Novo caso", icone: <Plus className="h-4 w-4" />, executar: () => router.push("/processos/novo") });
    return lista;
    // marcar/avancar/voltar leem o estado atual quando executam; a lista só muda com os dados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, linhaAberta, cursor, porId, salvas, pessoas, visiveis, nomeDe, router]);

  /* ---------- Tela ---------- */

  const acoesTopo = (
    <>
      <Button variant="secondary" onClick={() => setPaleta(true)} icon={<Command className="h-4 w-4" />}>
        Comandos
        <span className="hidden gap-0.5 sm:inline-flex">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </Button>
      <Link href="/processos/novo">
        <Button icon={<Plus className="h-4 w-4" />}>Novo caso</Button>
      </Link>
    </>
  );

  return (
    <>
      <PageHeader title="Processos" description="Central de casos: cada etapa tem portões, prazo e histórico permanente." actions={acoesTopo} />
      <AbasProcessos atual="central" contagem={processos ? { andamento: emPreparacao, protocolados: linhas.length - emPreparacao } : undefined} />
      {erro && <Alert>{erro}</Alert>}

      {!ready || carregando ? (
        <Spinner />
      ) : !processos?.length ? (
        !erro && (
          <Card>
            <EmptyState icon={<FolderOpen className="h-6 w-6" />} title="Nenhum caso ainda" description="Cadastre um atendimento: a Central acompanha o checklist, o prazo de cada etapa e o histórico." action={acoesTopo} />
          </Card>
        )
      ) : (
        <>
          <Esteira resumo={resumo} ativa={etapaFiltrada} onEscolher={filtrarEtapa} />
          <div className="flex items-start gap-4">
            <aside className="hidden w-56 shrink-0 xl:block">
              <PainelVisoes
                linhas={linhas}
                consulta={consulta}
                pessoas={pessoas}
                salvas={salvas}
                onEscolher={setConsulta}
                onSalvar={(rotulo) => {
                  const novas = [...salvas, { id: uid(), rotulo, consulta: consulta.trim() }];
                  setSalvas(novas);
                  gravarVisoesSalvas(novas);
                }}
                onRemover={(id) => {
                  const novas = salvas.filter((v) => v.id !== id);
                  setSalvas(novas);
                  gravarVisoesSalvas(novas);
                }}
              />
            </aside>

            <section className="relative min-w-0 flex-1 pb-20" aria-label="Grade de casos">
              <div className="mb-2 xl:hidden">
                <SeletorVisoes consulta={consulta} salvas={salvas} onEscolher={setConsulta} />
              </div>
              <BarraConsulta ref={busca} consulta={consulta} onConsulta={setConsulta} agrupar={agrupamento} onAgrupar={setAgrupamento} onExportar={() => baixarCsv(selecionados.size ? linhas.filter((l) => selecionados.has(l.processo.id)) : visiveis, nomeDe)} nomeDe={nomeDe} />
              {totalFiltrado ? (
                <GradeCasos
                  grupos={grupos}
                  agrupadoPorEtapa={agrupamento === "etapa"}
                  ordem={ordem}
                  onOrdenar={ordenarPor}
                  selecionados={selecionados}
                  onAlternar={alternar}
                  onAlternarTodos={(ids) => setSelecionados((s) => (ids.every((id) => s.has(id)) ? new Set() : new Set(ids)))}
                  cursor={cursor}
                  aberto={aberto}
                  compacta={!!linhaAberta}
                  onAbrir={(id) => {
                    setAberto((a) => (a === id ? undefined : id));
                    setCursor(id);
                  }}
                  recolhidos={recolhidos}
                  onRecolher={(k) =>
                    setRecolhidos((r) => {
                      const n = new Set(r);
                      if (n.has(k)) n.delete(k);
                      else n.add(k);
                      return n;
                    })
                  }
                  equipe={equipe}
                />
              ) : (
                <Card>
                  <EmptyState
                    icon={<ListFilter className="h-6 w-6" />}
                    title="Nenhum caso com esse filtro"
                    description="Tire um filtro ou escolha outra visão."
                    action={
                      <Button variant="secondary" onClick={() => setConsulta("")}>
                        Mostrar todos
                      </Button>
                    }
                  />
                </Card>
              )}
              <p className="mt-2 text-xs text-slate-400">
                {totalFiltrado} de {linhas.length} casos
              </p>

              {selecionados.size > 0 && (
                <div role="toolbar" aria-label="Ações nos selecionados" className="fixed inset-x-3 bottom-4 z-30 mx-auto flex max-w-fit animate-slide-in items-center gap-1 whitespace-nowrap rounded-xl bg-slate-900 px-2 py-1.5 text-sm text-white shadow-2xl">
                  <span className="px-3 font-medium">
                    {selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""}
                  </span>
                  <span className="h-5 w-px bg-white/20" aria-hidden />
                  <button type="button" onClick={() => avancar([...selecionados])} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-white/10">
                    Avançar etapa <Kbd escuro>]</Kbd>
                  </button>
                  <button type="button" onClick={() => setAtribuindo(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-white/10">
                    Atribuir <Kbd escuro>A</Kbd>
                  </button>
                  <button type="button" onClick={() => baixarCsv(linhas.filter((l) => selecionados.has(l.processo.id)), nomeDe)} className="hidden rounded-lg px-3 py-1.5 hover:bg-white/10 sm:block">
                    Exportar CSV
                  </button>
                  <button type="button" onClick={() => setSelecionados(new Set())} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Limpar seleção (Esc)">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </section>

            {linhaAberta && (
              <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 p-2 sm:p-4 lg:sticky lg:top-4 lg:z-auto lg:block lg:max-h-[calc(100vh-2rem)] lg:w-[360px] lg:shrink-0 lg:bg-transparent lg:p-0">
                <div className="flex h-full w-full max-w-md flex-col lg:max-w-none">
                  <FichaCaso
                    linha={linhaAberta}
                    avanco={avancoAberto}
                    ocupado={ocupado}
                    onFechar={() => setAberto(undefined)}
                    onAvancar={() => avancar([linhaAberta.processo.id])}
                    onVoltar={() => voltar(linhaAberta.processo.id)}
                    onMarcar={(item, feito) => void marcar(linhaAberta, item, feito)}
                    onCampos={(campos) => salvarCampos(linhaAberta.processo, campos)}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <PaletaComandos aberta={paleta} onFechar={() => setPaleta(false)} comandos={comandos} />
      <DialogoRetorno
        linha={retorno}
        onFechar={() => setRetorno(undefined)}
        onConfirmar={async (para, motivo) => {
          if (retorno && (await transicionar(retorno, para, motivo))) setRetorno(undefined);
        }}
      />
      <DialogoAvancoLote
        previa={lote?.previa}
        resultados={lote?.resultados}
        onFechar={() => setLote(undefined)}
        onAbrir={(id) => {
          setLote(undefined);
          setAberto(id);
        }}
        onConfirmar={async (ids) => {
          try {
            const r = await apiFluxo.lote({ acao: "avancar" }, ids);
            setLote((l) => (l ? { ...l, resultados: r.resultados } : l));
            setSelecionados(new Set());
            await recarregar();
          } catch (e) {
            tratarErro(e);
          }
        }}
      />
      <DialogoAtribuir
        quantos={selecionados.size}
        aberto={atribuindo}
        onFechar={() => setAtribuindo(false)}
        onConfirmar={async (pessoa) => {
          try {
            const r = await apiFluxo.lote({ acao: "atribuir", responsavelId: pessoa }, [...selecionados]);
            const ok = r.resultados.filter((x) => x.ok).length;
            toast(pessoa ? `${ok} caso(s) atribuído(s) a ${nomeDe(pessoa) ?? "pessoa"}` : `${ok} caso(s) sem responsável`);
            setAtribuindo(false);
            setSelecionados(new Set());
            await recarregar();
          } catch (e) {
            tratarErro(e);
          }
        }}
      />
    </>
  );
}

export default function CentralDeCasosPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Central />
    </Suspense>
  );
}
