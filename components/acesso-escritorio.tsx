"use client";

import { KeyRound, Mail, Send, UserMinus } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ErroApi } from "@/lib/auth/api";
import { DESCRICAO_PAPEL, PAPEIS, type PapelNoEscritorio, pode, ROTULO_PAPEL, type ResumoEscritorio } from "@/lib/escritorio";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/utils";
import { ConfirmDialog } from "./modal";
import { useToast } from "./toast";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, Spinner } from "./ui";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ESTILO_PAPEL: Record<PapelNoEscritorio, string> = {
  dono: "bg-brand-50 text-brand-700",
  advogado: "bg-emerald-50 text-emerald-700",
  estagiario: "bg-slate-100 text-slate-700",
};

export function SeloPapel({ papel }: { papel: PapelNoEscritorio }) {
  return <Badge className={ESTILO_PAPEL[papel]}>{ROTULO_PAPEL[papel]}</Badge>;
}

/** Pedido de convite vindo da lista de pessoas ("Convidar" ao lado de alguém sem acesso). */
export interface PedidoConvite {
  email: string;
  pessoaId?: string;
  nome?: string;
}

/** Carrega o escritório (papel, contas com acesso, convites) para a tela Equipe. */
export function useEscritorio() {
  const [resumo, setResumo] = useState<ResumoEscritorio>();
  const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    try {
      setResumo(await api<ResumoEscritorio>("/api/escritorio"));
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar a equipe.");
    }
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);
  return { resumo, erro, carregar };
}

/**
 * Quem tem acesso ao escritório no Clepsa: cada conta, com seu papel, e os convites pendentes.
 * O dono convida, muda papéis e tira pessoas; os demais só veem (e podem sair).
 */
export function AcessoEscritorio({ resumo, erro, carregar, pedido, onPedidoAtendido }: { resumo?: ResumoEscritorio; erro: string; carregar: () => Promise<void>; pedido?: PedidoConvite; onPedidoAtendido: () => void }) {
  const { toast } = useToast();
  const { recarregar } = useStore();
  const [form, setForm] = useState<{ email: string; papel: PapelNoEscritorio; pessoaId?: string; nome?: string }>({ email: "", papel: "advogado" });
  const [tentou, setTentou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroForm, setErroForm] = useState("");
  const [remover, setRemover] = useState<{ usuarioId: string; nome: string; voce: boolean }>();

  useEffect(() => {
    if (!pedido) return;
    setForm((f) => ({ ...f, email: pedido.email, pessoaId: pedido.pessoaId, nome: pedido.nome }));
    setErroForm("");
    onPedidoAtendido();
    requestAnimationFrame(() => document.getElementById("convite-email")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [pedido, onPedidoAtendido]);

  if (erro) return <Alert>{erro}</Alert>;
  if (!resumo) return <Spinner label="Carregando quem tem acesso…" />;

  const gerencia = pode(resumo.papel, "gerenciar_equipe");
  const donos = resumo.membros.filter((m) => m.papel === "dono").length;
  const erroEmail = !EMAIL.test(form.email.trim()) ? "Informe um e-mail válido." : undefined;

  async function convidar(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (erroEmail) return;
    setEnviando(true);
    setErroForm("");
    try {
      await api("/api/escritorio/convites", { body: { email: form.email.trim(), papel: form.papel, pessoaId: form.pessoaId } });
      toast("Convite enviado", { descricao: `${form.email.trim()} recebeu um e-mail com o link. Ele vale por 7 dias.` });
      setForm({ email: "", papel: form.papel });
      setTentou(false);
      await carregar();
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : "Não foi possível enviar o convite.");
    } finally {
      setEnviando(false);
    }
  }

  async function mudarPapel(usuarioId: string, papel: PapelNoEscritorio) {
    try {
      await api(`/api/escritorio/membros/${usuarioId}`, { method: "PATCH", body: { papel } });
      toast("Papel alterado", { descricao: DESCRICAO_PAPEL[papel] });
      await carregar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível mudar o papel.", { tom: "error" });
    }
  }

  async function cancelarConvite(id: string) {
    try {
      await api(`/api/escritorio/convites/${id}`, { method: "DELETE" });
      toast("Convite cancelado", { descricao: "O link do e-mail deixou de valer." });
      await carregar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível cancelar.", { tom: "error" });
    }
  }

  async function confirmarRemocao() {
    if (!remover) return;
    const alvo = remover;
    setRemover(undefined);
    try {
      await api(`/api/escritorio/membros/${alvo.usuarioId}`, { method: "DELETE" });
      if (alvo.voce) {
        window.location.assign("/");
        return;
      }
      toast(`${alvo.nome} não tem mais acesso`, { descricao: "Ficou como inativa na lista da equipe, para o histórico das intimações." });
      await Promise.all([carregar(), recarregar()]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível tirar o acesso.", { tom: "error" });
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title="Acesso ao Clepsa"
        subtitle={`Quem entra no escritório ${resumo.nome} e trabalha no mesmo acervo de intimações e processos. Cada pessoa tem seu próprio login.`}
      />
      <ul className="divide-y divide-slate-100">
        {resumo.membros.map((m) => {
          const voce = m.usuarioId === resumo.eu;
          const ultimoDono = m.papel === "dono" && donos <= 1;
          return (
            <li key={m.usuarioId} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700" aria-hidden>
                <KeyRound className="h-4 w-4" />
              </span>
              <div className="min-w-[11rem] flex-1">
                <p className="truncate text-sm font-medium text-slate-800">
                  {m.nome}
                  {voce && <span className="ml-1.5 text-xs font-normal text-slate-500">(você)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {m.email} · desde {formatDate(m.desde.slice(0, 10))}
                </p>
              </div>
              {gerencia ? (
                <Select
                  aria-label={`Papel de ${m.nome}`}
                  className="w-auto py-1 text-xs"
                  value={m.papel}
                  disabled={ultimoDono}
                  title={ultimoDono ? "O escritório precisa de pelo menos um dono." : undefined}
                  onChange={(e) => mudarPapel(m.usuarioId, e.target.value as PapelNoEscritorio)}
                >
                  {PAPEIS.map((p) => (
                    <option key={p} value={p}>
                      {ROTULO_PAPEL[p]}
                    </option>
                  ))}
                </Select>
              ) : (
                <SeloPapel papel={m.papel} />
              )}
              {(gerencia || voce) && !ultimoDono && (
                <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" icon={<UserMinus className="h-4 w-4" />} onClick={() => setRemover({ usuarioId: m.usuarioId, nome: m.nome, voce })}>
                  {voce ? "Sair" : "Tirar acesso"}
                </Button>
              )}
            </li>
          );
        })}
        {resumo.convites.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 bg-slate-50/60 px-5 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700" aria-hidden>
              <Mail className="h-4 w-4" />
            </span>
            <div className="min-w-[11rem] flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{c.email}</p>
              <p className="truncate text-xs text-slate-500">
                Convite pendente · vale até {formatDate(c.expiraEm.slice(0, 10))}
                {c.convidadoPor ? ` · enviado por ${c.convidadoPor}` : ""}
              </p>
            </div>
            <SeloPapel papel={c.papel} />
            <Button size="sm" variant="ghost" onClick={() => cancelarConvite(c.id)}>
              Cancelar convite
            </Button>
          </li>
        ))}
      </ul>

      {gerencia && resumo.convitesDisponiveis && (
        <form onSubmit={convidar} noValidate className="space-y-3 border-t border-slate-100 p-5">
          <p className="text-sm font-medium text-slate-800">{form.nome ? `Convidar ${form.nome}` : "Convidar alguém do escritório"}</p>
          {erroForm && <Alert>{erroForm}</Alert>}
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto]">
            <Field label="E-mail" htmlFor="convite-email" required error={tentou ? erroEmail : undefined}>
              <Input
                id="convite-email"
                type="email"
                placeholder="ana@escritorio.com.br"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                invalid={tentou && !!erroEmail}
              />
            </Field>
            <Field label="Papel" htmlFor="convite-papel">
              <Select id="convite-papel" value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value as PapelNoEscritorio })}>
                {PAPEIS.map((p) => (
                  <option key={p} value={p}>
                    {ROTULO_PAPEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" icon={<Send className="h-4 w-4" />} disabled={enviando} className="w-full">
                {enviando ? "Enviando…" : "Enviar convite"}
              </Button>
            </div>
          </div>
          <p className="text-xs text-slate-500">{DESCRICAO_PAPEL[form.papel]}</p>
        </form>
      )}
      {gerencia && !resumo.convitesDisponiveis && (
        <div className="border-t border-slate-100 p-5">
          <Alert tone="info">Convites precisam do banco de dados. Nesta instalação, cada conta é um escritório de uma pessoa só.</Alert>
        </div>
      )}
      {!gerencia && (
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Você é {ROTULO_PAPEL[resumo.papel].toLowerCase()} neste escritório. {DESCRICAO_PAPEL[resumo.papel]}
        </p>
      )}

      <ConfirmDialog
        open={!!remover}
        onClose={() => setRemover(undefined)}
        onConfirm={confirmarRemocao}
        title={remover?.voce ? "Sair do escritório?" : `Tirar o acesso de ${remover?.nome}?`}
        description={
          remover?.voce
            ? "Você deixa de ver as intimações e os processos do escritório. Sua conta continua existindo, num escritório só seu, vazio. Seus processos particulares ficam guardados aqui e voltam se você for convidado de novo."
            : "A pessoa deixa de ver o escritório na hora. Nada do acervo é apagado: as intimações dela continuam com o nome dela como responsável. Processos particulares dela ficam guardados, sem que ninguém os veja."
        }
        confirmLabel={remover?.voce ? "Sair" : "Tirar acesso"}
      />
    </Card>
  );
}
