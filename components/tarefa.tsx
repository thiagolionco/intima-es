"use client";

import clsx from "clsx";
import { CalendarClock, CalendarDays, Eye, ListTodo, SearchCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import { rotuloTarefa, sugerirTarefa, type DadosTarefa, type TomTarefa } from "@/lib/tarefas";
import type { Intimacao } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { useToast } from "./toast";
import { Button, Card, CardHeader } from "./ui";

const TONS: Record<TomTarefa, string> = {
  audiencia: "bg-violet-50 text-violet-700 ring-violet-600/20",
  acao: "bg-brand-50 text-brand-700 ring-brand-600/20",
  ciencia: "bg-slate-50 text-slate-500 ring-slate-400/20",
  analisar: "bg-white text-slate-500 ring-slate-300",
};

const ICONES: Record<TomTarefa, ReactNode> = {
  audiencia: <CalendarDays className="h-3 w-3" aria-hidden />,
  acao: <ListTodo className="h-3 w-3" aria-hidden />,
  ciencia: <Eye className="h-3 w-3" aria-hidden />,
  analisar: <SearchCheck className="h-3 w-3" aria-hidden />,
};

/** Selo com a tarefa que a publicação parece pedir. */
export function SeloTarefa({ i, className }: { i: DadosTarefa; className?: string }) {
  const t = sugerirTarefa(i);
  return (
    <span
      className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONS[t.tom], className)}
      title={`Tarefa sugerida: ${t.acao}`}
    >
      {ICONES[t.tom]}
      {t.rotulo}
    </span>
  );
}

/** Cartão da ficha da intimação: a tarefa sugerida, a pista no texto e o prazo que a lei costuma dar. */
export function CartaoTarefa({ i }: { i: Intimacao }) {
  const { atualizarIntimacao } = useStore();
  const { toast } = useToast();
  const t = sugerirTarefa(i);
  const aberta = i.status === "nova" || i.status === "em_analise";
  return (
    <Card>
      <CardHeader title="Tarefa sugerida" subtitle="Lida automaticamente na publicação" action={<SeloTarefa i={i} />} />
      <div className="space-y-3 p-5 text-sm">
        <p className="font-medium text-slate-900">{t.acao}</p>
        {t.data && (
          <p className="flex items-center gap-1.5 text-violet-700">
            <CalendarDays className="h-4 w-4" aria-hidden />
            {formatDate(t.data)}
            {t.hora && ` às ${t.hora}`}
          </p>
        )}
        {t.trecho && <p className="text-xs text-slate-500">Pista no texto: “{t.trecho}”</p>}
        {t.outras.length > 0 && <p className="text-xs text-slate-500">Também pode pedir: {t.outras.map(rotuloTarefa).join(", ")}.</p>}
        {t.prazoLegal && (
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <p className="flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Prazo usual: {t.prazoLegal.dias} dias úteis ({t.prazoLegal.base}). Vale o que o juízo fixou.
            </p>
            {aberta && !i.prazo && (
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => {
                  atualizarIntimacao(i.id, { regraPrazo: { dias: t.prazoLegal!.dias, contagem: "uteis", dobro: false, fonte: "usuario" } });
                  toast(`Prazo de ${t.prazoLegal!.dias} dias úteis contado`);
                }}
              >
                Contar {t.prazoLegal.dias} dias úteis
              </Button>
            )}
          </div>
        )}
        <p className="text-xs text-slate-400">Sugestão por regras simples. Confira no inteiro teor antes de agir.</p>
      </div>
    </Card>
  );
}
