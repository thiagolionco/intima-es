"use client";

import { CalendarOff, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { DatePicker } from "@/components/date-picker";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { Calendario, ehJusticaFederal } from "@/lib/prazos/calendario";
import { lerPrazoDoTexto } from "@/lib/prazos/calculo";
import { dataBR, diaDaSemana, NOMES_DIAS } from "@/lib/prazos/datas";
import { useStore } from "@/lib/store";
import type { Suspensao } from "@/lib/types";
import { hojeISO, uid } from "@/lib/utils";

const VAZIA = { inicio: "", fim: "", descricao: "", tribunal: "" };

function periodo(s: Pick<Suspensao, "inicio" | "fim">) {
  return s.inicio === s.fim ? dataBR(s.inicio) : `${dataBR(s.inicio)} a ${dataBR(s.fim)}`;
}

export default function PrazosPage() {
  const { ready, intimacoes, suspensoes, salvarSuspensoes, calcularPrazosPendentes } = useStore();
  const { toast } = useToast();
  const [nova, setNova] = useState(VAZIA);
  const [tentou, setTentou] = useState(false);
  const anoAtual = Number(hojeISO().slice(0, 4));
  const [ano, setAno] = useState(anoAtual);
  const [tribunal, setTribunal] = useState("");

  const pendentes = useMemo(
    () => intimacoes.filter((i) => (i.status === "nova" || i.status === "em_analise") && !i.prazo && !i.regraPrazo && lerPrazoDoTexto(i.texto)).length,
    [intimacoes],
  );
  const tribunais = useMemo(() => [...new Set(intimacoes.map((i) => i.tribunal).filter(Boolean))].sort(), [intimacoes]);
  const dias = useMemo(() => new Calendario(tribunal, suspensoes).diasDoAno(ano), [tribunal, suspensoes, ano]);

  const erros = {
    inicio: !nova.inicio ? "Informe o primeiro dia." : undefined,
    fim: nova.fim && nova.inicio && nova.fim < nova.inicio ? "O último dia não pode ser antes do primeiro." : undefined,
    descricao: !nova.descricao.trim() ? "Diga o motivo (ex.: feriado municipal, portaria)." : undefined,
  };

  function adicionar(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (erros.inicio || erros.fim || erros.descricao) return;
    const s: Suspensao = {
      id: uid(),
      inicio: nova.inicio,
      fim: nova.fim || nova.inicio,
      descricao: nova.descricao.trim(),
      tribunal: nova.tribunal.trim().toUpperCase() || undefined,
    };
    salvarSuspensoes([...suspensoes, s].sort((a, b) => a.inicio.localeCompare(b.inicio)));
    setNova(VAZIA);
    setTentou(false);
    toast("Suspensão cadastrada", { descricao: "Os prazos em aberto foram recalculados." });
  }

  if (!ready) return <Spinner />;

  return (
    <>
      <PageHeader title="Prazos e feriados" description="O vencimento é calculado a partir da disponibilização no DJEN, pulando fins de semana, feriados nacionais, o recesso de fim de ano e as suspensões cadastradas aqui." />

      {pendentes > 0 && (
        <Card className="mb-6">
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <Sparkles className="hidden h-5 w-5 shrink-0 text-brand-600 sm:block" aria-hidden />
            <p className="flex-1 text-sm text-slate-700">
              <strong>{pendentes} intimação(ões) em aberto</strong> estão sem prazo, mas o texto delas diz quantos dias há. Quer calcular agora? Você confere cada uma depois.
            </p>
            <Button
              onClick={() => {
                const n = calcularPrazosPendentes();
                toast(`${n} prazo(s) calculado(s)`, { descricao: "Eles aparecem como “lido no texto” até você conferir." });
              }}
            >
              Calcular prazos
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Feriados locais e suspensões" subtitle="Feriados estaduais e municipais, portarias do tribunal, indisponibilidade do sistema" />
          <form onSubmit={adicionar} noValidate className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2">
            <Field label="Primeiro dia" htmlFor="susp-inicio" required error={tentou ? erros.inicio : undefined}>
              <DatePicker id="susp-inicio" value={nova.inicio} onChange={(v) => setNova({ ...nova, inicio: v })} invalid={tentou && !!erros.inicio} />
            </Field>
            <Field label="Último dia" htmlFor="susp-fim" error={tentou ? erros.fim : undefined} hint="Deixe vazio para um dia só">
              <DatePicker id="susp-fim" value={nova.fim} onChange={(v) => setNova({ ...nova, fim: v })} min={nova.inicio || undefined} invalid={tentou && !!erros.fim} />
            </Field>
            <Field label="Motivo" htmlFor="susp-desc" required error={tentou ? erros.descricao : undefined} className="sm:col-span-2">
              <Input id="susp-desc" placeholder="Ex.: Corpus Christi, Aniversário de São Paulo, Portaria 123/2026" value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} invalid={tentou && !!erros.descricao} />
            </Field>
            <Field label="Tribunal" htmlFor="susp-trib" hint="Vazio vale para todos">
              <Input id="susp-trib" list="susp-tribunais" placeholder="TJSP" value={nova.tribunal} onChange={(e) => setNova({ ...nova, tribunal: e.target.value.toUpperCase() })} />
              <datalist id="susp-tribunais">
                {tribunais.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <div className="flex items-end">
              <Button type="submit" icon={<Plus className="h-4 w-4" />} className="w-full">
                Adicionar
              </Button>
            </div>
          </form>
          {suspensoes.length ? (
            <ul className="divide-y divide-slate-100">
              {suspensoes.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{s.descricao}</p>
                    <p className="text-xs text-slate-500">{periodo(s)}</p>
                  </div>
                  <Badge className={s.tribunal ? "bg-brand-50 text-brand-700" : undefined}>{s.tribunal || "Todos"}</Badge>
                  <button
                    type="button"
                    onClick={() => {
                      salvarSuspensoes(suspensoes.filter((x) => x.id !== s.id));
                      toast("Suspensão removida", { descricao: "Os prazos em aberto foram recalculados." });
                    }}
                    className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remover ${s.descricao}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<CalendarOff className="h-6 w-6" />} title="Nenhuma suspensão cadastrada" description="Só os feriados nacionais e o recesso entram no cálculo por enquanto." />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Dias sem contagem"
            subtitle={ehJusticaFederal(tribunal) ? "Feriados nacionais e os da Lei 5.010/1966 (Justiça Federal)" : "Feriados nacionais e suspensões cadastradas"}
            action={
              <div className="flex gap-2">
                <Input value={tribunal} onChange={(e) => setTribunal(e.target.value.toUpperCase())} placeholder="Tribunal" className="w-24" aria-label="Tribunal" />
                <Select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="w-24" aria-label="Ano">
                  {[anoAtual - 1, anoAtual, anoAtual + 1].map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </Select>
              </div>
            }
          />
          <ul className="divide-y divide-slate-100">
            {dias.map((d, idx) => (
              <li key={`${d.data}-${idx}`} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="w-24 shrink-0 font-mono text-slate-700">{dataBR(d.data)}</span>
                <span className="w-28 shrink-0 text-xs text-slate-400">{NOMES_DIAS[diaDaSemana(d.data)]}</span>
                <span className="min-w-0 flex-1 truncate text-slate-700">{d.motivo}</span>
              </li>
            ))}
            <li className="px-5 py-3 text-xs text-slate-500">
              Além destes, de 20/12 a 20/01 os prazos ficam suspensos (art. 220 do CPC). Corpus Christi e feriados locais não entram sozinhos porque variam de tribunal para tribunal: cadastre-os ao lado.
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
