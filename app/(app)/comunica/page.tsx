"use client";

import clsx from "clsx";
import { CheckCircle2, ChevronDown, CircleAlert, Clock, Download, FileSearch, Loader2, Search, Settings2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, Skeleton } from "@/components/ui";
import { chaveDeduplicacao, validarConsulta, type IntimacaoImportada } from "@/lib/comunica";
import { useStore } from "@/lib/store";
import type { TermoMonitorado, TipoTermo } from "@/lib/types";
import { addDays, formatDate, hojeISO, resumo, TIPO_TERMO_LABEL, UFS } from "@/lib/utils";

type EstadoBusca = { estado: "aguardando" | "buscando" | "ok" | "erro"; total?: number; truncado?: boolean; aviso?: string; erro?: string };
interface Achado {
  chave: string;
  cliente: string;
  item: IntimacaoImportada;
}

const AVULSA = "__avulsa__";
const TODOS = "__todos__";

function BuscaComunica() {
  const { ready, termos, importarDoComunica, existeNoAcervo } = useStore();
  const { toast } = useToast();
  const params = useSearchParams();

  const [alvo, setAlvo] = useState<string>(params.get("termo") || TODOS);
  const [dataInicio, setDataInicio] = useState(addDays(hojeISO(), -7));
  const [dataFim, setDataFim] = useState(hojeISO());
  const [avulsa, setAvulsa] = useState({ apelido: "", tipo: "parte" as TipoTermo, valor: "", ufOab: "", tribunal: "" });
  const [progresso, setProgresso] = useState<Record<string, EstadoBusca>>({});
  const [achados, setAchados] = useState<Achado[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [buscando, setBuscando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const cancelar = useRef<AbortController | null>(null);

  useEffect(() => () => cancelar.current?.abort(), []);

  const ativos = termos.filter((t) => t.ativo);

  function termosDaBusca(): TermoMonitorado[] {
    if (alvo === TODOS) return ativos;
    if (alvo === AVULSA) {
      return [
        {
          id: AVULSA,
          apelido: avulsa.apelido.trim() || avulsa.valor.trim(),
          tipo: avulsa.tipo,
          valor: avulsa.valor,
          ufOab: avulsa.ufOab || undefined,
          tribunal: avulsa.tribunal || undefined,
          ativo: true,
          createdAt: "",
        },
      ];
    }
    return termos.filter((t) => t.id === alvo);
  }

  async function buscar() {
    const lista = termosDaBusca();
    setErroForm(null);
    if (!lista.length) {
      setErroForm(alvo === TODOS ? "Nenhum cliente ativo. Cadastre ou ative clientes primeiro." : "Selecione o que pesquisar.");
      return;
    }
    for (const t of lista) {
      const erro = validarConsulta({ termo: t, dataInicio, dataFim });
      if (erro) {
        setErroForm(lista.length > 1 ? `${t.apelido}: ${erro}` : erro);
        return;
      }
    }

    cancelar.current?.abort();
    const ctrl = new AbortController();
    cancelar.current = ctrl;
    setBuscando(true);
    setAchados([]);
    setSelecionados(new Set());
    setProgresso(Object.fromEntries(lista.map((t) => [t.id, { estado: "aguardando" }])));

    const encontrados: Achado[] = [];
    const vistos = new Set<string>();
    let falhas = 0;

    // Consulta um cliente por vez para respeitar o limite de requisições do Comunica.
    for (const t of lista) {
      if (ctrl.signal.aborted) break;
      setProgresso((p) => ({ ...p, [t.id]: { estado: "buscando" } }));
      try {
        const qs = new URLSearchParams({ tipo: t.tipo, valor: t.valor, dataInicio, dataFim });
        if (t.ufOab) qs.set("ufOab", t.ufOab);
        if (t.tribunal) qs.set("tribunal", t.tribunal);
        const resp = await fetch(`/api/comunica?${qs}`, { signal: ctrl.signal });
        const json = await resp.json().catch(() => ({ erro: "Resposta inválida do servidor." }));
        if (!resp.ok) throw new Error((json.erro || `Erro ${resp.status}`) + (json.detalhe ? ` Detalhe: ${json.detalhe}` : ""));
        for (const item of json.itens as IntimacaoImportada[]) {
          const chave = chaveDeduplicacao(item);
          if (vistos.has(chave)) continue;
          vistos.add(chave);
          encontrados.push({ chave, cliente: t.apelido, item });
        }
        setProgresso((p) => ({ ...p, [t.id]: { estado: "ok", total: json.itens.length, truncado: json.truncado, aviso: json.aviso } }));
        setAchados([...encontrados]);
      } catch (e) {
        if (ctrl.signal.aborted) break;
        falhas++;
        setProgresso((p) => ({ ...p, [t.id]: { estado: "erro", erro: e instanceof Error ? e.message : String(e) } }));
      }
    }

    setBuscando(false);
    if (ctrl.signal.aborted) return;
    const novos = encontrados.filter((a) => !existeNoAcervo(a.item));
    setSelecionados(new Set(novos.map((a) => a.chave)));
    if (falhas === lista.length) toast("A busca falhou", { tom: "error", descricao: "Veja os detalhes abaixo." });
    else toast("Busca concluída", { tom: falhas ? "info" : "success", descricao: `${encontrados.length} comunicação(ões) encontrada(s), ${novos.length} nova(s).` });
  }

  function importar(somente?: Achado[]) {
    const lote = somente ?? achados.filter((a) => selecionados.has(a.chave));
    if (!lote.length) return;
    let novas = 0;
    let duplicadas = 0;
    // Agrupa por cliente para preservar o vínculo.
    const porCliente = new Map<string, IntimacaoImportada[]>();
    lote.forEach((a) => porCliente.set(a.cliente, [...(porCliente.get(a.cliente) ?? []), a.item]));
    porCliente.forEach((itens, cliente) => {
      const r = importarDoComunica(itens, cliente);
      novas += r.novas;
      duplicadas += r.duplicadas;
    });
    setSelecionados(new Set());
    toast(`${novas} intimação(ões) importada(s)`, { descricao: duplicadas ? `${duplicadas} já estavam no acervo e foram ignoradas.` : undefined });
  }

  const novosAchados = useMemo(() => achados.filter((a) => !existeNoAcervo(a.item)), [achados, existeNoAcervo]);
  const listaProgresso = termosDaBusca().filter((t) => progresso[t.id]);

  if (!ready) return <Skeleton className="h-96" />;

  return (
    <>
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Buscar no Comunica PJe</h1>
        <p className="text-sm text-slate-500">
          Consulta a API pública do{" "}
          <a href="https://comunica.pje.jus.br/" target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:underline">
            Comunica PJe
          </a>{" "}
          (Diário de Justiça Eletrônico Nacional) e importa as comunicações para o seu acervo.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Parâmetros da busca"
          action={
            <Link href="/clientes" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
              <Settings2 className="h-3.5 w-3.5" /> Configurar clientes
            </Link>
          }
        />
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Pesquisar" htmlFor="alvo" className="xl:col-span-2">
            <Select id="alvo" value={alvo} onChange={(e) => setAlvo(e.target.value)}>
              <option value={TODOS}>Todos os clientes ativos ({ativos.length})</option>
              {termos.length > 0 && (
                <optgroup label="Um cliente">
                  {termos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.apelido} — {TIPO_TERMO_LABEL[t.tipo].toLowerCase()}
                      {t.ativo ? "" : " (inativo)"}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value={AVULSA}>Pesquisa avulsa…</option>
            </Select>
          </Field>
          <Field label="Disponibilizadas de" htmlFor="ini">
            <DatePicker id="ini" value={dataInicio} onChange={setDataInicio} max={dataFim || hojeISO()} clearable={false} />
          </Field>
          <Field label="Até" htmlFor="fim">
            <DatePicker id="fim" value={dataFim} onChange={setDataFim} min={dataInicio} max={hojeISO()} clearable={false} />
          </Field>

          {alvo === AVULSA && (
            <div className="grid animate-fade-in gap-4 rounded-lg bg-slate-50 p-4 md:col-span-2 md:grid-cols-2 xl:col-span-4 xl:grid-cols-5">
              <Field label="Pesquisar por" htmlFor="av-tipo">
                <Select id="av-tipo" value={avulsa.tipo} onChange={(e) => setAvulsa({ ...avulsa, tipo: e.target.value as TipoTermo })}>
                  {(Object.keys(TIPO_TERMO_LABEL) as TipoTermo[]).map((t) => (
                    <option key={t} value={t}>
                      {TIPO_TERMO_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Valor" htmlFor="av-valor" className={avulsa.tipo === "oab" ? "" : "xl:col-span-2"}>
                <Input id="av-valor" value={avulsa.valor} onChange={(e) => setAvulsa({ ...avulsa, valor: e.target.value })} />
              </Field>
              {avulsa.tipo === "oab" && (
                <Field label="UF" htmlFor="av-uf">
                  <Select id="av-uf" value={avulsa.ufOab} onChange={(e) => setAvulsa({ ...avulsa, ufOab: e.target.value })}>
                    <option value="">—</option>
                    {UFS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Tribunal (opcional)" htmlFor="av-trib">
                <Input id="av-trib" value={avulsa.tribunal} onChange={(e) => setAvulsa({ ...avulsa, tribunal: e.target.value.toUpperCase() })} placeholder="TJSP" />
              </Field>
              <Field label="Vincular ao cliente" htmlFor="av-cli" hint="Opcional">
                <Input id="av-cli" list="clientes-avulsa" value={avulsa.apelido} onChange={(e) => setAvulsa({ ...avulsa, apelido: e.target.value })} />
                <datalist id="clientes-avulsa">
                  {termos.map((t) => (
                    <option key={t.id} value={t.apelido} />
                  ))}
                </datalist>
              </Field>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Dica: períodos curtos (até 30 dias) respondem mais rápido. São trazidas até 500 comunicações por cliente.</p>
          <div className="flex gap-2">
            {buscando && (
              <Button variant="secondary" onClick={() => cancelar.current?.abort()}>
                Cancelar
              </Button>
            )}
            <Button onClick={buscar} loading={buscando} icon={<Search className="h-4 w-4" />}>
              {buscando ? "Buscando…" : "Buscar intimações"}
            </Button>
          </div>
        </div>
      </Card>

      {erroForm && (
        <div className="mt-4">
          <Alert tone="error">{erroForm}</Alert>
        </div>
      )}

      {termos.length === 0 && alvo !== AVULSA && (
        <div className="mt-4">
          <Alert tone="warning" title="Nenhum cliente configurado">
            <Link href="/clientes" className="font-medium underline">
              Cadastre os clientes
            </Link>{" "}
            que deseja monitorar, ou use a pesquisa avulsa.
          </Alert>
        </div>
      )}

      {listaProgresso.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Andamento" />
          <ul className="divide-y divide-slate-100">
            {listaProgresso.map((t) => {
              const p = progresso[t.id];
              return (
                <li key={t.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                  {p.estado === "aguardando" && <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
                  {p.estado === "buscando" && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand-600" />}
                  {p.estado === "ok" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
                  {p.estado === "erro" && <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800">{t.apelido}</p>
                    <p className={clsx("text-xs", p.estado === "erro" ? "text-red-600" : "text-slate-500")}>
                      {p.estado === "aguardando" && "Na fila"}
                      {p.estado === "buscando" && "Consultando o Comunica PJe… nomes com muitas publicações podem levar até um ou dois minutos."}
                      {p.estado === "ok" && `${p.total} comunicação(ões) encontrada(s)${p.truncado ? ` — ${p.aviso ?? "resultado limitado; reduza o período para ver todas"}` : ""}`}
                      {p.estado === "erro" && p.erro}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {!buscando && listaProgresso.length > 0 && achados.length === 0 && Object.values(progresso).some((p) => p.estado === "ok") && (
        <Card className="mt-6">
          <EmptyState icon={<FileSearch className="h-6 w-6" />} title="Nenhuma comunicação no período" description="Tente ampliar o intervalo de datas ou revisar os termos pesquisados." />
        </Card>
      )}

      {achados.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            title={`Resultados (${achados.length})`}
            subtitle={`${novosAchados.length} nova(s) · ${achados.length - novosAchados.length} já no acervo`}
            action={
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="secondary" disabled={!selecionados.size} onClick={() => importar()}>
                  Importar selecionadas ({selecionados.size})
                </Button>
                <Button size="sm" icon={<Download className="h-4 w-4" />} disabled={!novosAchados.length} onClick={() => importar(novosAchados)}>
                  Importar todas as novas
                </Button>
              </div>
            }
          />
          <ul className="divide-y divide-slate-100">
            {achados.map((a) => {
              const noAcervo = existeNoAcervo(a.item);
              const aberto = expandido === a.chave;
              return (
                <li key={a.chave} className={clsx("px-5 py-4", noAcervo && "bg-slate-50/60")}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      disabled={noAcervo}
                      checked={selecionados.has(a.chave)}
                      onChange={(e) =>
                        setSelecionados((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(a.chave);
                          else n.delete(a.chave);
                          return n;
                        })
                      }
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600 disabled:opacity-40"
                      aria-label="Selecionar para importar"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{a.item.tipoComunicacao}</Badge>
                        {a.item.tribunal && <Badge className="bg-brand-50 text-brand-700">{a.item.tribunal}</Badge>}
                        <Badge className="bg-violet-50 text-violet-700">{a.cliente}</Badge>
                        {noAcervo && <Badge className="bg-emerald-50 text-emerald-700">Já no acervo</Badge>}
                        <span className="ml-auto text-xs text-slate-500">{formatDate(a.item.dataDisponibilizacao)}</span>
                      </div>
                      <p className="mt-1.5 font-mono text-sm font-semibold text-slate-900">{a.item.numeroProcesso || "—"}</p>
                      <p className="text-xs text-slate-500">
                        {a.item.orgao}
                        {a.item.classe && ` · ${a.item.classe}`}
                      </p>
                      {a.item.partes.length > 0 && <p className="mt-1 text-xs text-slate-600">Partes: {a.item.partes.map((p) => p.nome).join(" × ")}</p>}
                      <p className={clsx("mt-2 whitespace-pre-wrap text-sm text-slate-600", !aberto && "line-clamp-3")}>{aberto ? a.item.texto : resumo(a.item.texto, 400)}</p>
                      <button onClick={() => setExpandido(aberto ? null : a.chave)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                        {aberto ? "Recolher" : "Ver inteiro teor"}
                        <ChevronDown className={clsx("h-3.5 w-3.5 transition", aberto && "rotate-180")} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

export default function ComunicaPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <BuscaComunica />
    </Suspense>
  );
}
