"use client";

import clsx from "clsx";
import { KeyRound, Plus, Send, UserRoundX, UsersRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AcessoEscritorio, type PedidoConvite, SeloPapel, useEscritorio } from "@/components/acesso-escritorio";
import { Avatar } from "@/components/equipe";
import { PrazoTag } from "@/components/intimacao-card";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Spinner } from "@/components/ui";
import { DIAS_URGENTE, painelPorPessoa, type LinhaPainel } from "@/lib/equipe";
import { useStore } from "@/lib/store";
import type { PessoaEquipe } from "@/lib/types";
import { hojeISO, uid } from "@/lib/utils";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Numero({ valor, rotulo, tom }: { valor: number; rotulo: string; tom?: "perigo" | "alerta" }) {
  return (
    <div>
      <p className={clsx("text-xl font-semibold tabular-nums", valor && tom === "perigo" ? "text-red-600" : valor && tom === "alerta" ? "text-amber-600" : "text-slate-900")}>{valor}</p>
      <p className="text-xs text-slate-500">{rotulo}</p>
    </div>
  );
}

function CartaoPessoa({ l }: { l: LinhaPainel }) {
  const filtro = l.pessoa ? l.pessoa.id : "nenhum";
  return (
    <Card className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        {l.pessoa ? (
          <Avatar pessoa={l.pessoa} className="h-9 w-9 text-xs" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <UserRoundX className="h-4 w-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{l.pessoa?.nome ?? "Sem responsável"}</p>
          <p className="truncate text-xs text-slate-500">{l.pessoa ? l.pessoa.email || "Sem e-mail" : "Ainda não entregues a ninguém"}</p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 px-5 py-4">
        <Numero valor={l.abertas} rotulo="Em aberto" />
        <Numero valor={l.vencidas} rotulo="Vencidas" tom="perigo" />
        <Numero valor={l.urgentes} rotulo={`Até ${DIAS_URGENTE} dias úteis`} tom="alerta" />
        <Numero valor={l.semPrazo} rotulo="Sem prazo" />
      </div>
      {l.proximas.length > 0 && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {l.proximas.map((i) => (
            <li key={i.id}>
              <Link href={`/intimacoes/${i.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs font-medium text-slate-800">{i.numeroProcesso}</p>
                  <p className="truncate text-xs text-slate-500">{i.cliente}</p>
                </div>
                <PrazoTag prazo={i.prazo} status={i.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto border-t border-slate-100 px-5 py-3">
        <Link href={`/intimacoes?responsavel=${filtro}`} className="text-xs font-medium text-brand-700 hover:underline">
          Ver todas as intimações {l.pessoa ? `de ${l.pessoa.nome.split(" ")[0]}` : "sem responsável"}
        </Link>
      </div>
    </Card>
  );
}

export default function EquipePage() {
  const { ready, intimacoes, suspensoes, equipe, salvarEquipe, delegarIntimacoes, gerenciaEquipe } = useStore();
  const { toast } = useToast();
  const escritorio = useEscritorio();
  const [pedido, setPedido] = useState<PedidoConvite>();
  const atendido = useCallback(() => setPedido(undefined), []);
  const contas = useMemo(() => new Map((escritorio.resumo?.membros ?? []).map((m) => [m.usuarioId, m])), [escritorio.resumo]);
  const convidados = useMemo(() => new Set((escritorio.resumo?.convites ?? []).map((c) => c.email.toLowerCase())), [escritorio.resumo]);
  const podeConvidar = gerenciaEquipe && !!escritorio.resumo?.convitesDisponiveis;

  // Quem já tem conta no escritório e está na lista com o mesmo e-mail (ex.: o próprio dono) fica ligado à conta.
  useEffect(() => {
    if (!ready || !gerenciaEquipe || !escritorio.resumo) return;
    const ligadas = new Set(equipe.map((p) => p.usuarioId).filter(Boolean));
    const porEmail = new Map(escritorio.resumo.membros.map((m) => [m.email.toLowerCase(), m.usuarioId]));
    let mudou = false;
    const nova = equipe.map((p) => {
      const id = !p.usuarioId && p.email ? porEmail.get(p.email.trim().toLowerCase()) : undefined;
      if (!id || ligadas.has(id)) return p;
      ligadas.add(id);
      mudou = true;
      return { ...p, usuarioId: id };
    });
    if (mudou) salvarEquipe(nova);
  }, [ready, gerenciaEquipe, escritorio.resumo, equipe, salvarEquipe]);
  const [nova, setNova] = useState({ nome: "", email: "" });
  const [tentou, setTentou] = useState(false);

  const painel = useMemo(() => painelPorPessoa(intimacoes, equipe, hojeISO(), suspensoes), [intimacoes, equipe, suspensoes]);

  const erros = {
    nome: !nova.nome.trim() ? "Informe o nome." : equipe.some((p) => p.nome.toLowerCase() === nova.nome.trim().toLowerCase()) ? "Já há alguém com este nome." : undefined,
    email: nova.email.trim() && !EMAIL.test(nova.email.trim()) ? "E-mail inválido." : undefined,
  };

  function adicionar(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (erros.nome || erros.email) return;
    const p: PessoaEquipe = { id: uid(), nome: nova.nome.trim(), email: nova.email.trim() || undefined };
    salvarEquipe([...equipe, p].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    setNova({ nome: "", email: "" });
    setTentou(false);
    toast(`${p.nome} entrou na equipe`, { descricao: "Já dá para entregar intimações a esta pessoa." });
  }

  function remover(p: PessoaEquipe) {
    const delas = intimacoes.filter((i) => i.responsavelId === p.id).map((i) => i.id);
    delegarIntimacoes(delas, null);
    salvarEquipe(equipe.filter((x) => x.id !== p.id));
    toast(`${p.nome} saiu da equipe`, { descricao: delas.length ? `${delas.length} intimação(ões) ficaram sem responsável.` : undefined });
  }

  if (!ready) return <Spinner />;

  return (
    <>
      <PageHeader title="Equipe" description="Quem tem acesso ao escritório, quem cuida de cada intimação e como está a carga de cada pessoa. Entregue intimações pela lista (selecionando várias) ou no detalhe de cada uma." />

      <AcessoEscritorio {...escritorio} pedido={pedido} onPedidoAtendido={atendido} />

      {equipe.length > 0 && (
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {painel.map((l) => (
            <CartaoPessoa key={l.pessoa?.id ?? "nenhum"} l={l} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader
          title="Pessoas da equipe"
          subtitle="Quem pode ser responsável por uma intimação ou processo. Quem tem acesso ao Clepsa recebe por e-mail os avisos dos prazos que são dele; os de quem não tem acesso vão para o dono."
        />
        {gerenciaEquipe && (
        <form onSubmit={adicionar} noValidate className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="Nome" htmlFor="pessoa-nome" required error={tentou ? erros.nome : undefined}>
            <Input id="pessoa-nome" placeholder="Ex.: Ana Souza" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} invalid={tentou && !!erros.nome} />
          </Field>
          <Field label="E-mail" htmlFor="pessoa-email" error={tentou ? erros.email : undefined}>
            <Input id="pessoa-email" type="email" placeholder="ana@escritorio.com.br" value={nova.email} onChange={(e) => setNova({ ...nova, email: e.target.value })} invalid={tentou && !!erros.email} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" icon={<Plus className="h-4 w-4" />} className="w-full">
              Adicionar
            </Button>
          </div>
        </form>
        )}
        {equipe.length ? (
          <ul className="divide-y divide-slate-100">
            {equipe.map((p) => {
              const abertas = painel.find((l) => l.pessoa?.id === p.id)?.abertas ?? 0;
              const conta = p.usuarioId ? contas.get(p.usuarioId) : undefined;
              const convidada = !!p.email && convidados.has(p.email.toLowerCase());
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Avatar pessoa={p} className={p.inativa ? "opacity-40" : undefined} />
                  <div className="min-w-0 flex-1">
                    <p className={clsx("truncate text-sm font-medium", p.inativa ? "text-slate-400" : "text-slate-800")}>
                      {p.nome}
                      {p.inativa && " (inativa)"}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {p.email || "Sem e-mail"} · {abertas} em aberto
                    </p>
                  </div>
                  {conta ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                      <KeyRound className="h-3.5 w-3.5 text-brand-600" aria-hidden /> Com acesso <SeloPapel papel={conta.papel} />
                    </span>
                  ) : convidada ? (
                    <span className="text-xs text-amber-700">Convite enviado</span>
                  ) : (
                    podeConvidar &&
                    !p.inativa && (
                      <Button size="sm" variant="secondary" icon={<Send className="h-3.5 w-3.5" />} onClick={() => setPedido({ email: p.email ?? "", pessoaId: p.id, nome: p.nome })}>
                        Dar acesso
                      </Button>
                    )
                  )}
                  {gerenciaEquipe && !conta && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => salvarEquipe(equipe.map((x) => (x.id === p.id ? { ...x, inativa: !x.inativa || undefined } : x)))}>
                        {p.inativa ? "Reativar" : "Desativar"}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => remover(p)}>
                        Remover
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<UsersRound className="h-6 w-6" />} title="Ninguém na equipe ainda" description="Cadastre quem trabalha no escritório para entregar intimações e acompanhar a carga de cada um. Quem você convidar para o Clepsa entra aqui sozinho." />
        )}
      </Card>
    </>
  );
}
