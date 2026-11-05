"use client";

import clsx from "clsx";
import { AlertTriangle, CheckCircle2, ExternalLink, Newspaper, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { AbasNews } from "@/components/abas-rota";
import { GuardarNaBiblioteca } from "@/components/guardar-na-biblioteca";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import type { ItemFeed } from "@/lib/news/feeds";
import { FEEDS, NATUREZA, type FonteFeed, type Natureza } from "@/lib/news/fontes";
import { useApi } from "@/lib/use-api";

interface LeituraFonte {
  id: string;
  ok: boolean;
  lidoEm: string;
  itens: ItemFeed[];
  erro?: string;
}

const POR_ID = new Map(FEEDS.map((f) => [f.id, f]));
const ORDEM_NATUREZA: Natureza[] = ["jurisprudencia", "noticia", "plenario", "legislativo"];
const COR: Record<Natureza, string> = {
  jurisprudencia: "bg-brand-50 text-brand-700 ring-brand-200",
  noticia: "bg-slate-100 text-slate-700 ring-slate-200",
  plenario: "bg-violet-50 text-violet-700 ring-violet-200",
  legislativo: "bg-amber-50 text-amber-800 ring-amber-200",
};

const fmtData = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "sem data";

function diasAtras(iso?: string) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

export default function NewsPage() {
  const { dados, erro, recarregar } = useApi<{ fontes: LeituraFonte[] }>("/api/news");
  const [filtro, setFiltro] = useState<Natureza | "todas">("todas");
  const [orgao, setOrgao] = useState<string>("todos");
  const [recarregando, setRecarregando] = useState(false);

  const itens = useMemo(() => {
    const lista: (ItemFeed & { fonte: FonteFeed })[] = [];
    for (const l of dados?.fontes ?? []) {
      const fonte = POR_ID.get(l.id);
      if (fonte) for (const i of l.itens) lista.push({ ...i, fonte });
    }
    return lista
      .filter((i) => (filtro === "todas" || i.fonte.natureza === filtro) && (orgao === "todos" || i.fonte.orgao === orgao))
      .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
  }, [dados, filtro, orgao]);

  const orgaos = useMemo(() => [...new Set(FEEDS.map((f) => f.orgao))], []);
  const lidoEm = dados?.fontes.filter((f) => f.ok).map((f) => f.lidoEm).sort()[0];
  const falhas = dados?.fontes.filter((f) => !f.ok) ?? [];

  async function atualizar() {
    setRecarregando(true);
    await recarregar();
    setRecarregando(false);
  }

  return (
    <>
      <PageHeader
        title="News"
        description="O que saiu nas fontes oficiais do STF, do STJ e do Congresso. O Clepsa lê os feeds uma vez por dia, de madrugada. Nada vem de agregador."
        actions={
          <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={recarregando} onClick={() => void atualizar()}>
            Recarregar
          </Button>
        }
      />
      <AbasNews atual="feed" />

      {erro && <Alert>{erro}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por natureza">
            {(["todas", ...ORDEM_NATUREZA] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setFiltro(n)}
                aria-pressed={filtro === n}
                className={clsx(
                  "rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset transition",
                  filtro === n ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                )}
              >
                {n === "todas" ? "Tudo" : NATUREZA[n].rotulo}
              </button>
            ))}
            <select
              aria-label="Filtrar por órgão"
              value={orgao}
              onChange={(e) => setOrgao(e.target.value)}
              className="rounded-full border-0 bg-white px-3 py-1 text-sm text-slate-600 ring-1 ring-inset ring-slate-200"
            >
              <option value="todos">Todos os órgãos</option>
              {orgaos.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          {filtro !== "todas" && <Alert tone="info">{NATUREZA[filtro].aviso}</Alert>}

          <Card>
            {!dados && !erro ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : itens.length === 0 ? (
              <EmptyState icon={<Newspaper className="h-6 w-6" />} title="Nada por aqui" description="Nenhum item com esse filtro. Troque o filtro ou recarregue mais tarde." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {itens.map((i) => (
                  <li key={`${i.fonte.id}-${i.link}`} className="space-y-1.5 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge className={clsx("ring-1 ring-inset", COR[i.fonte.natureza])}>{i.fonte.orgao}</Badge>
                      <span>{i.fonte.nome}</span>
                      <span aria-hidden>·</span>
                      <time dateTime={i.data}>{fmtData(i.data)}</time>
                      {diasAtras(i.data) < 1.5 && <Badge className="bg-emerald-50 text-emerald-700">novo</Badge>}
                    </div>
                    <a href={i.link} target="_blank" rel="noreferrer noopener" className="group block text-sm font-medium text-slate-900 hover:text-brand-700">
                      {i.titulo}
                      <ExternalLink className="ml-1 inline h-3.5 w-3.5 text-slate-400 group-hover:text-brand-600" aria-hidden />
                    </a>
                    {i.resumo && <p className="line-clamp-3 text-sm text-slate-600">{i.resumo}</p>}
                    {i.fonte.natureza === "jurisprudencia" && (
                      <div className="pt-1">
                        <GuardarNaBiblioteca
                          etiqueta="news"
                          item={{ tipo: "jurisprudencia", titulo: i.titulo, tribunal: i.fonte.orgao, referencia: i.fonte.nome, texto: i.resumo || i.titulo, link: i.link }}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title="Fontes lidas" subtitle={lidoEm ? `Leitura de ${fmtData(lidoEm)}` : undefined} />
            <ul className="divide-y divide-slate-100">
              {FEEDS.map((f) => {
                const l = dados?.fontes.find((x) => x.id === f.id);
                return (
                  <li key={f.id} className="flex items-start gap-2 px-5 py-3 text-sm">
                    {!l ? (
                      <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-slate-200" aria-hidden />
                    ) : l.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="lida" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-label="fora do ar" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">
                        {f.orgao} · {f.nome}
                      </p>
                      {l && !l.ok ? (
                        <a href={f.pagina} target="_blank" rel="noreferrer noopener" className="text-xs text-amber-700 hover:underline">
                          Não respondeu hoje. Abrir a página oficial
                        </a>
                      ) : (
                        <p className="text-xs text-slate-500">{l ? `${l.itens.length} itens` : "carregando…"}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
          {falhas.length > 0 && (
            <p className="px-1 text-xs text-slate-500">Fonte fora do ar não some da lista: o Clepsa tenta de novo na próxima abertura e na ronda da madrugada.</p>
          )}
          <Card>
            <div className="space-y-2 p-5 text-sm text-slate-600">
              <p className="font-medium text-slate-800">Sem feed oficial</p>
              <p>O DOU, o Planalto e o CNJ não oferecem feed que o Clepsa possa ler. A checagem deles está na rotina do Guia de curadoria.</p>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
