"use client";

import clsx from "clsx";
import { Download, FileSearch, Filter, LayoutGrid, Plus, Rows3, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { IntimacaoCard, PrazoTag } from "@/components/intimacao-card";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Button, Card, EmptyState, Input, PageHeader, Select, Skeleton, StatusBadge } from "@/components/ui";
import { DialogoExportacao } from "@/components/exportacao/dialogo-exportacao";
import { contarFiltrosAtivos, filtrarIntimacoes, FILTROS_VAZIOS, ordenarIntimacoes, type Ordenacao } from "@/lib/filtros";
import { useStore } from "@/lib/store";
import type { FiltrosIntimacao, StatusIntimacao } from "@/lib/types";
import { addDays, formatDate, hojeISO, resumo, STATUS_LABEL, STATUS_ORDER, TIPOS_COMUNICACAO_PADRAO } from "@/lib/utils";

const POR_PAGINA = 20;

function unicos(valores: string[]): string[] {
  return [...new Set(valores.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function ListaIntimacoes() {
  const { ready, intimacoes, atualizarIntimacao, excluirIntimacao, excluirIntimacoes } = useStore();
  const { toast } = useToast();
  const params = useSearchParams();
  const router = useRouter();

  const [filtros, setFiltros] = useState<FiltrosIntimacao>(() => ({
    ...FILTROS_VAZIOS,
    status: (params.get("status") as StatusIntimacao) || "",
    cliente: params.get("cliente") || "",
    busca: params.get("q") || "",
  }));
  const [ordem, setOrdem] = useState<Ordenacao>((params.get("ordem") as Ordenacao) || "data_desc");
  const [visao, setVisao] = useState<"cards" | "tabela">("cards");
  const [pagina, setPagina] = useState(1);
  const [painelFiltros, setPainelFiltros] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState<{ ids: string[] } | null>(null);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem("controle-intimacoes:visao");
      if (v === "cards" || v === "tabela") setVisao(v);
    } catch {}
  }, []);

  function mudarVisao(v: "cards" | "tabela") {
    setVisao(v);
    try {
      localStorage.setItem("controle-intimacoes:visao", v);
    } catch {}
  }

  const opcoes = useMemo(
    () => ({
      tipos: unicos([...TIPOS_COMUNICACAO_PADRAO, ...intimacoes.map((i) => i.tipoComunicacao)]),
      clientes: unicos(intimacoes.map((i) => i.cliente)),
      tribunais: unicos(intimacoes.map((i) => i.tribunal)),
    }),
    [intimacoes],
  );

  const resultado = useMemo(() => ordenarIntimacoes(filtrarIntimacoes(intimacoes, filtros), ordem), [intimacoes, filtros, ordem]);
  const totalPaginas = Math.max(1, Math.ceil(resultado.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = resultado.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);
  const ativos = contarFiltrosAtivos(filtros);

  useEffect(() => setPagina(1), [filtros, ordem]);
  // Remove da seleção itens que deixaram de existir.
  useEffect(() => {
    setSelecionadas((s) => {
      const ids = new Set(intimacoes.map((i) => i.id));
      const nova = new Set([...s].filter((id) => ids.has(id)));
      return nova.size === s.size ? s : nova;
    });
  }, [intimacoes]);

  function set<K extends keyof FiltrosIntimacao>(k: K, v: FiltrosIntimacao[K]) {
    setFiltros((f) => ({ ...f, [k]: v }));
  }

  function atalhoPeriodo(dias: number | "mes") {
    const hoje = hojeISO();
    if (dias === "mes") setFiltros((f) => ({ ...f, dataInicio: hoje.slice(0, 8) + "01", dataFim: hoje }));
    else setFiltros((f) => ({ ...f, dataInicio: addDays(hoje, -dias), dataFim: hoje }));
  }

  function limparFiltros() {
    setFiltros(FILTROS_VAZIOS);
    router.replace("/intimacoes");
  }

  function alternar(id: string, v: boolean) {
    setSelecionadas((s) => {
      const n = new Set(s);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  const todasVisiveisSelecionadas = visiveis.length > 0 && visiveis.every((i) => selecionadas.has(i.id));
  function alternarTodas() {
    setSelecionadas((s) => {
      const n = new Set(s);
      visiveis.forEach((i) => (todasVisiveisSelecionadas ? n.delete(i.id) : n.add(i.id)));
      return n;
    });
  }

  const conjuntosExportacao = useMemo(
    () => [
      { id: "filtradas", rotulo: "Resultado atual", descricao: ativos || filtros.busca ? `${ativos} filtro(s) ativo(s)${filtros.busca ? ` · busca "${filtros.busca}"` : ""}` : "Sem filtros, na ordem da lista", itens: resultado },
      { id: "selecionadas", rotulo: "Selecionadas", descricao: selecionadas.size ? "Marcadas na lista" : "Marque itens na lista", itens: resultado.filter((i) => selecionadas.has(i.id)) },
      { id: "todas", rotulo: "Acervo completo", descricao: "Todas as intimações da conta", itens: intimacoes },
    ],
    [resultado, selecionadas, intimacoes, ativos, filtros.busca],
  );

  function mudarStatusLote(status: StatusIntimacao) {
    selecionadas.forEach((id) => atualizarIntimacao(id, { status }));
    toast(`${selecionadas.size} intimação(ões) marcadas como "${STATUS_LABEL[status]}"`);
    setSelecionadas(new Set());
  }

  if (!ready) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Intimações"
        description={`${resultado.length} de ${intimacoes.length} intimação(ões)`}
        actions={
          <>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => setExportando(true)} disabled={!intimacoes.length}>
              Exportar{selecionadas.size ? ` (${selecionadas.size})` : ""}
            </Button>
            <Link href="/intimacoes/nova">
              <Button icon={<Plus className="h-4 w-4" />}>Nova intimação</Button>
            </Link>
          </>
        }
      />

      {/* Barra de busca e ações */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              value={filtros.busca}
              onChange={(e) => set("busca", e.target.value)}
              placeholder="Buscar por processo, parte, advogado, órgão ou texto…"
              className="pl-9"
              aria-label="Buscar intimações"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={painelFiltros || ativos ? "primary" : "secondary"} onClick={() => setPainelFiltros((p) => !p)} icon={<Filter className="h-4 w-4" />}>
              Filtros{ativos ? ` (${ativos})` : ""}
            </Button>
            <Select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordenacao)} className="w-auto" aria-label="Ordenar por">
              <option value="data_desc">Mais recentes</option>
              <option value="data_asc">Mais antigas</option>
              <option value="prazo">Prazo mais próximo</option>
              <option value="tribunal">Tribunal</option>
            </Select>
            <div className="hidden rounded-lg bg-slate-100 p-0.5 sm:flex">
              <button
                onClick={() => mudarVisao("cards")}
                className={clsx("rounded-md p-1.5", visao === "cards" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                aria-label="Ver como cards"
                aria-pressed={visao === "cards"}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => mudarVisao("tabela")}
                className={clsx("rounded-md p-1.5", visao === "tabela" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                aria-label="Ver como tabela"
                aria-pressed={visao === "tabela"}
              >
                <Rows3 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {(painelFiltros || ativos > 0) && (
          <div className="mt-4 grid animate-fade-in gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="xl:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">Disponibilização</span>
              <div className="grid grid-cols-2 gap-2">
                <DatePicker value={filtros.dataInicio} onChange={(v) => set("dataInicio", v)} max={filtros.dataFim || undefined} placeholder="De" aria-label="Data inicial" />
                <DatePicker value={filtros.dataFim} onChange={(v) => set("dataFim", v)} min={filtros.dataInicio || undefined} placeholder="Até" aria-label="Data final" />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[
                  { r: "Hoje", v: 0 },
                  { r: "7 dias", v: 7 },
                  { r: "30 dias", v: 30 },
                  { r: "Este mês", v: "mes" as const },
                ].map((a) => (
                  <button key={a.r} onClick={() => atalhoPeriodo(a.v)} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-brand-50 hover:text-brand-700">
                    {a.r}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">Tipo de comunicação</span>
              <Select value={filtros.tipoComunicacao} onChange={(e) => set("tipoComunicacao", e.target.value)}>
                <option value="">Todos</option>
                {opcoes.tipos.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">Status</span>
              <Select value={filtros.status} onChange={(e) => set("status", e.target.value as StatusIntimacao | "")}>
                <option value="">Todos</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">Cliente</span>
              <Select value={filtros.cliente} onChange={(e) => set("cliente", e.target.value)}>
                <option value="">Todos</option>
                {opcoes.clientes.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">Tribunal</span>
              <Select value={filtros.tribunal} onChange={(e) => set("tribunal", e.target.value)}>
                <option value="">Todos</option>
                {opcoes.tribunais.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </label>
            {ativos > 0 && (
              <div className="flex items-end sm:col-span-2 lg:col-span-3 xl:col-span-6">
                <button onClick={limparFiltros} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
                  <X className="h-3.5 w-3.5" /> Limpar filtros
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Ações em lote */}
      {resultado.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-2 text-slate-600">
            <input type="checkbox" checked={todasVisiveisSelecionadas} onChange={alternarTodas} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
            Selecionar página
          </label>
          {selecionadas.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-1.5 animate-fade-in">
              <span className="font-medium text-brand-800">{selecionadas.size} selecionada(s)</span>
              <Select
                value=""
                onChange={(e) => e.target.value && mudarStatusLote(e.target.value as StatusIntimacao)}
                className="w-auto py-1 text-xs"
                aria-label="Alterar status das selecionadas"
              >
                <option value="">Alterar status…</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmar({ ids: [...selecionadas] })}>
                Excluir
              </Button>
              <button onClick={() => setSelecionadas(new Set())} className="text-xs text-slate-500 hover:underline">
                Limpar seleção
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        {intimacoes.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FileSearch className="h-6 w-6" />}
              title="Nenhuma intimação cadastrada"
              description="Importe intimações do Comunica PJe ou cadastre uma manualmente."
              action={
                <div className="flex gap-2">
                  <Link href="/comunica">
                    <Button variant="secondary">Buscar no Comunica</Button>
                  </Link>
                  <Link href="/intimacoes/nova">
                    <Button>Cadastrar</Button>
                  </Link>
                </div>
              }
            />
          </Card>
        ) : resultado.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="Nenhum resultado"
              description="Nenhuma intimação corresponde à busca e aos filtros aplicados."
              action={
                <Button variant="secondary" onClick={limparFiltros}>
                  Limpar filtros
                </Button>
              }
            />
          </Card>
        ) : visao === "cards" ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {visiveis.map((i) => (
              <IntimacaoCard
                key={i.id}
                intimacao={i}
                selecionada={selecionadas.has(i.id)}
                onSelecionar={(v) => alternar(i.id, v)}
                onStatus={(s) => {
                  atualizarIntimacao(i.id, { status: s });
                  toast(`Status alterado para "${STATUS_LABEL[s]}"`);
                }}
                onExcluir={() => setConfirmar({ ids: [i.id] })}
              />
            ))}
          </div>
        ) : (
          <Card className="overflow-hidden">
            <div className="scroll-fino overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <span className="sr-only">Selecionar</span>
                    </th>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Processo / Cliente</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Órgão</th>
                    <th className="px-4 py-3">Texto</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {visiveis.map((i) => (
                    <tr key={i.id} className={clsx("align-top hover:bg-slate-50", selecionadas.has(i.id) && "bg-brand-50/50")}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selecionadas.has(i.id)}
                          onChange={(e) => alternar(i.id, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                          aria-label="Selecionar"
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(i.dataDisponibilizacao)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/intimacoes/${i.id}`} className="font-mono text-xs font-semibold text-slate-900 hover:text-brand-700">
                          {i.numeroProcesso}
                        </Link>
                        <p className="text-xs text-slate-500">{i.cliente}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {i.tipoComunicacao}
                        <p className="text-xs text-slate-400">{i.tribunal}</p>
                      </td>
                      <td className="max-w-[200px] px-4 py-3 text-xs text-slate-600">{i.orgao}</td>
                      <td className="max-w-sm px-4 py-3 text-xs text-slate-600">{resumo(i.texto, 140)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={i.status} />
                          <PrazoTag prazo={i.prazo} status={i.status} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {totalPaginas > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Paginação">
          <span className="text-slate-500">
            Página {paginaAtual} de {totalPaginas}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={paginaAtual === 1} onClick={() => setPagina(paginaAtual - 1)}>
              Anterior
            </Button>
            <Button variant="secondary" size="sm" disabled={paginaAtual === totalPaginas} onClick={() => setPagina(paginaAtual + 1)}>
              Próxima
            </Button>
          </div>
        </nav>
      )}

      <DialogoExportacao aberto={exportando} onFechar={() => setExportando(false)} conjuntos={conjuntosExportacao} conjuntoInicial={selecionadas.size ? "selecionadas" : "filtradas"} />

      <ConfirmDialog
        open={!!confirmar}
        onClose={() => setConfirmar(null)}
        title={confirmar && confirmar.ids.length > 1 ? `Excluir ${confirmar.ids.length} intimações?` : "Excluir intimação?"}
        description="Esta ação não pode ser desfeita. Se a intimação veio do Comunica, ela poderá ser importada de novo numa próxima busca."
        onConfirm={() => {
          if (!confirmar) return;
          if (confirmar.ids.length === 1) excluirIntimacao(confirmar.ids[0]);
          else excluirIntimacoes(confirmar.ids);
          setSelecionadas(new Set());
          toast(confirmar.ids.length > 1 ? `${confirmar.ids.length} intimações excluídas` : "Intimação excluída");
        }}
      />
    </>
  );
}

export default function IntimacoesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <ListaIntimacoes />
    </Suspense>
  );
}
