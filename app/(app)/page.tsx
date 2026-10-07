"use client";

import clsx from "clsx";
import { AlertTriangle, ArrowRight, Bell, CalendarClock, FileSearch, Inbox, ListChecks, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BarList, ColumnChart, DonutChart, PALETA, type Ponto } from "@/components/charts";
import { IntimacaoCard, PrazoTag } from "@/components/intimacao-card";
import { Button, Card, CardHeader, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { useToast } from "@/components/toast";
import { gerarDadosDemo } from "@/lib/demo";
import { useStore } from "@/lib/store";
import type { Intimacao, StatusIntimacao } from "@/lib/types";
import { addDays, diffDays, formatDate, hojeISO, MESES_CURTOS, STATUS_LABEL, STATUS_ORDER } from "@/lib/utils";

const CORES_STATUS: Record<StatusIntimacao, string> = {
  nova: "#2147ed",
  em_analise: "#f59e0b",
  respondida: "#10b981",
  arquivada: "#94a3b8",
};

function contarPor(lista: Intimacao[], chave: (i: Intimacao) => string, limite = 6): Ponto[] {
  const mapa = new Map<string, number>();
  for (const i of lista) {
    const k = chave(i) || "Não informado";
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  const ordenado = [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  const topo = ordenado.slice(0, limite).map(([rotulo, valor]) => ({ rotulo, valor }));
  const resto = ordenado.slice(limite).reduce((s, [, v]) => s + v, 0);
  if (resto) topo.push({ rotulo: "Outros", valor: resto });
  return topo;
}

function StatCard({ titulo, valor, detalhe, icone: Icone, tom, href }: { titulo: string; valor: number; detalhe: string; icone: typeof Inbox; tom: string; href: string }) {
  return (
    <Link href={href} className="group">
      <Card className="h-full p-5 transition group-hover:border-brand-200 group-hover:shadow-md">
        <div className="flex items-start justify-between">
          <p className="text-sm font-medium text-slate-500">{titulo}</p>
          <span className={clsx("flex h-9 w-9 items-center justify-center rounded-lg", tom)}>
            <Icone className="h-4 w-4" aria-hidden />
          </span>
        </div>
        <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{valor}</p>
        <p className="mt-1 text-xs text-slate-500">{detalhe}</p>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const { ready, intimacoes, termos, substituirTudo, atualizarIntimacao } = useStore();
  const { toast } = useToast();
  const [periodo, setPeriodo] = useState<6 | 12>(6);
  const hoje = hojeISO();

  const dados = useMemo(() => {
    const novas = intimacoes.filter((i) => i.status === "nova").length;
    const emAnalise = intimacoes.filter((i) => i.status === "em_analise").length;
    const abertas = intimacoes.filter((i) => (i.status === "nova" || i.status === "em_analise") && i.prazo);
    const vencidas = abertas.filter((i) => i.prazo! < hoje);
    const proximas = abertas.filter((i) => i.prazo! >= hoje && diffDays(hoje, i.prazo!) <= 7).sort((a, b) => a.prazo!.localeCompare(b.prazo!));
    const ultimos30 = intimacoes.filter((i) => i.dataDisponibilizacao >= addDays(hoje, -30)).length;

    const base = new Date();
    const meses: Ponto[] = [];
    for (let k = periodo - 1; k >= 0; k--) {
      const d = new Date(base.getFullYear(), base.getMonth() - k, 1);
      const prefixo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      meses.push({
        rotulo: `${MESES_CURTOS[d.getMonth()]}${d.getMonth() === 0 || k === periodo - 1 ? `/${String(d.getFullYear()).slice(2)}` : ""}`,
        valor: intimacoes.filter((i) => i.dataDisponibilizacao.startsWith(prefixo)).length,
      });
    }

    return {
      novas,
      emAnalise,
      vencidas,
      proximas,
      ultimos30,
      meses,
      porTipo: contarPor(intimacoes, (i) => i.tipoComunicacao, 5),
      porStatus: STATUS_ORDER.map((s) => ({ rotulo: STATUS_LABEL[s], valor: intimacoes.filter((i) => i.status === s).length, cor: CORES_STATUS[s] })),
      porCliente: contarPor(intimacoes, (i) => i.cliente, 6),
      porTribunal: contarPor(intimacoes, (i) => i.tribunal, 6),
      recentes: [...intimacoes].sort((a, b) => b.dataDisponibilizacao.localeCompare(a.dataDisponibilizacao)).slice(0, 4),
    };
  }, [intimacoes, hoje, periodo]);

  if (!ready) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (intimacoes.length === 0) {
    return (
      <>
        <PageHeader title="Painel" description="Resumo das intimações da sua carteira de clientes." />
        <Card>
          <EmptyState
            icon={<Inbox className="h-6 w-6" />}
            title="Nenhuma intimação por aqui ainda"
            description={
              termos.length
                ? "Busque no Comunica PJe as intimações dos clientes que você cadastrou, ou cadastre uma manualmente."
                : "Comece cadastrando os clientes que deseja monitorar. Depois é só buscar as intimações no Comunica PJe."
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href={termos.length ? "/comunica" : "/clientes"}>
                  <Button icon={<FileSearch className="h-4 w-4" />}>{termos.length ? "Buscar no Comunica" : "Cadastrar clientes"}</Button>
                </Link>
                <Button
                  variant="secondary"
                  icon={<Sparkles className="h-4 w-4" />}
                  onClick={() => {
                    const demo = gerarDadosDemo();
                    substituirTudo(demo.intimacoes, termos.length ? undefined : demo.termos);
                    toast("Dados de demonstração carregados", { descricao: `${demo.intimacoes.length} intimações fictícias criadas.` });
                  }}
                >
                  Carregar dados de exemplo
                </Button>
              </div>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Painel"
        description={`Hoje é ${formatDate(hoje)}. Você acompanha ${termos.filter((t) => t.ativo).length} cliente(s) ativo(s).`}
        actions={
          <>
            <Link href="/comunica">
              <Button variant="secondary" icon={<FileSearch className="h-4 w-4" />}>
                Buscar novas
              </Button>
            </Link>
            <Link href="/intimacoes/nova">
              <Button icon={<Plus className="h-4 w-4" />}>Nova intimação</Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard titulo="Total no acervo" valor={intimacoes.length} detalhe={`${dados.ultimos30} nos últimos 30 dias`} icone={ListChecks} tom="bg-slate-100 text-slate-600" href="/intimacoes" />
        <StatCard titulo="Novas (não lidas)" valor={dados.novas} detalhe="Aguardando primeira análise" icone={Bell} tom="bg-brand-50 text-brand-600" href="/intimacoes?status=nova" />
        <StatCard titulo="Em análise" valor={dados.emAnalise} detalhe="Em tratamento pela equipe" icone={CalendarClock} tom="bg-amber-50 text-amber-600" href="/intimacoes?status=em_analise" />
        <StatCard
          titulo="Prazos vencidos"
          valor={dados.vencidas.length}
          detalhe={`${dados.proximas.length} vencem nos próximos 7 dias`}
          icone={AlertTriangle}
          tom={dados.vencidas.length ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}
          href="/intimacoes?ordem=prazo"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Intimações por mês"
            subtitle="Pela data de disponibilização"
            action={
              <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
                {([6, 12] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriodo(p)}
                    className={clsx("rounded-md px-2.5 py-1 transition", periodo === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                  >
                    {p} meses
                  </button>
                ))}
              </div>
            }
          />
          <div className="p-5">
            <ColumnChart dados={dados.meses} altura={220} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Por status" />
          <div className="p-5">
            <DonutChart dados={dados.porStatus} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Por tipo de comunicação" />
          <div className="p-5">
            <DonutChart dados={dados.porTipo} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Por cliente" />
          <div className="p-5">
            <BarList dados={dados.porCliente} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Por tribunal" />
          <div className="p-5">
            <BarList dados={dados.porTribunal} cor={PALETA[1]} />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Mais recentes"
            action={
              <Link href="/intimacoes" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                Ver todas <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {dados.recentes.map((i) => (
              <IntimacaoCard key={i.id} intimacao={i} compacto />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Prazos a acompanhar" subtitle="Vencidos e próximos 7 dias" />
          {dados.vencidas.length + dados.proximas.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">Nenhum prazo pendente. 🎉</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...dados.vencidas, ...dados.proximas].slice(0, 8).map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/intimacoes/${i.id}`} className="block truncate font-mono text-xs font-semibold text-slate-800 hover:text-brand-700">
                      {i.numeroProcesso}
                    </Link>
                    <p className="truncate text-xs text-slate-500">
                      {i.cliente} · prazo {formatDate(i.prazo)}
                    </p>
                  </div>
                  <PrazoTag prazo={i.prazo} status={i.status} />
                  <button
                    onClick={() => {
                      atualizarIntimacao(i.id, { status: "respondida" });
                      toast("Intimação marcada como respondida");
                    }}
                    className="rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                  >
                    Concluir
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
