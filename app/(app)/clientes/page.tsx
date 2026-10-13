"use client";

import clsx from "clsx";
import { AlertTriangle, FileSearch, Pencil, Plus, RefreshCw, Timer, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ConfirmDialog, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { useStore } from "@/lib/store";
import type { TermoMonitorado, TipoTermo } from "@/lib/types";
import { api } from "@/lib/auth/api";
import { formatDateTime, TIPO_TERMO_LABEL, UFS } from "@/lib/utils";
import type { Lacuna } from "@/lib/cobertura";
import { dataBR } from "@/lib/prazos/datas";
import { useCobertura } from "@/lib/use-cobertura";

/** Tipos procurados sozinhos pelo servidor (ver server/rondas/ronda-comunica.ts). */
const AUTOMATICOS: TipoTermo[] = ["oab", "processo"];

function StatusRonda({ t, lacunas }: { t: TermoMonitorado; lacunas: Lacuna[] }) {
  if (!AUTOMATICOS.includes(t.tipo)) return null;
  const r = t.ultimaRonda;
  const dias = lacunas.filter((l) => l.termoId === t.id).map((l) => dataBR(l.dia));
  return (
    <>
      <p className={clsx("mt-3 flex items-start gap-1.5 text-xs", r?.erro ? "text-amber-800" : "text-slate-500")}>
        {r?.erro ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> : <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
        <span>
          {!t.ativo
            ? "Busca automática pausada."
            : !r
              ? "Busca automática ligada; ainda não rodou."
              : `Busca automática em ${formatDateTime(r.em)}: ${r.novas} nova(s).${r.erro ? ` ${r.erro}` : ""}`}
        </span>
      </p>
      {t.ativo && dias.length > 0 && (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {dias.length} dia(s) sem verificação: {dias.slice(0, 5).join(", ")}
            {dias.length > 5 && ` e mais ${dias.length - 5}`}. A busca automática tenta de novo sozinha.
          </span>
        </p>
      )}
    </>
  );
}
import { validarTermo } from "@/lib/validacao";

type Rascunho = Pick<TermoMonitorado, "apelido" | "tipo" | "valor" | "ufOab" | "tribunal" | "ativo">;
const VAZIO: Rascunho = { apelido: "", tipo: "parte", valor: "", ufOab: "", tribunal: "", ativo: true };

const PLACEHOLDER: Record<TipoTermo, string> = {
  parte: "Ex.: Construtora Horizonte Ltda",
  advogado: "Ex.: Lucas Andrade Martins",
  oab: "Ex.: 123456",
  processo: "0000000-00.0000.0.00.0000",
};

const DICA: Record<TipoTermo, string> = {
  parte: "Use o nome exatamente como aparece nos processos (razão social completa para empresas).",
  advogado: "Traz todas as comunicações em que o advogado consta como destinatário.",
  oab: "Traz as comunicações destinadas ao número de OAB informado. Selecione a UF.",
  processo: "Acompanha um processo específico (número CNJ com 20 dígitos).",
};

function FormTermo({ inicial, onSalvar, onCancelar }: { inicial: Rascunho; onSalvar: (r: Rascunho) => void; onCancelar: () => void }) {
  const [r, setR] = useState<Rascunho>(inicial);
  const [tentou, setTentou] = useState(false);
  const erros = tentou ? validarTermo({ ...r, ufOab: r.ufOab ?? "", tribunal: r.tribunal ?? "" }) : {};

  function submeter(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (Object.keys(validarTermo(r)).length) return;
    onSalvar({
      ...r,
      apelido: r.apelido.trim(),
      valor: r.valor.trim(),
      tribunal: r.tribunal?.trim().toUpperCase() || undefined,
      ufOab: r.tipo === "oab" ? r.ufOab : undefined,
    });
  }

  return (
    <form onSubmit={submeter} noValidate className="space-y-4">
      <Field label="Nome do cliente" htmlFor="apelido" required error={erros.apelido} hint="Como você quer ver este cliente na aplicação">
        <Input id="apelido" autoFocus value={r.apelido} onChange={(e) => setR({ ...r, apelido: e.target.value })} invalid={!!erros.apelido} />
      </Field>
      <Field label="Pesquisar por" htmlFor="tipo" required>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(TIPO_TERMO_LABEL) as TipoTermo[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setR({ ...r, tipo: t })}
              className={clsx(
                "rounded-lg px-3 py-2 text-left text-sm ring-1 ring-inset transition",
                r.tipo === t ? "bg-brand-50 font-medium text-brand-800 ring-brand-300" : "text-slate-600 ring-slate-200 hover:bg-slate-50",
              )}
              aria-pressed={r.tipo === t}
            >
              {TIPO_TERMO_LABEL[t]}
            </button>
          ))}
        </div>
      </Field>
      <div className={clsx("grid gap-3", r.tipo === "oab" && "grid-cols-[1fr_100px]")}>
        <Field label={TIPO_TERMO_LABEL[r.tipo]} htmlFor="valor" required error={erros.valor} hint={DICA[r.tipo]}>
          <Input id="valor" value={r.valor} placeholder={PLACEHOLDER[r.tipo]} onChange={(e) => setR({ ...r, valor: e.target.value })} invalid={!!erros.valor} />
        </Field>
        {r.tipo === "oab" && (
          <Field label="UF" htmlFor="uf" required error={erros.ufOab}>
            <Select id="uf" value={r.ufOab ?? ""} onChange={(e) => setR({ ...r, ufOab: e.target.value })} invalid={!!erros.ufOab}>
              <option value="">—</option>
              {UFS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <Field label="Tribunal (opcional)" htmlFor="trib" error={erros.tribunal} hint="Restringe a busca a um tribunal, ex.: TJSP, TRT2, TRF3">
        <Input id="trib" value={r.tribunal ?? ""} onChange={(e) => setR({ ...r, tribunal: e.target.value.toUpperCase() })} invalid={!!erros.tribunal} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={r.ativo}
          onChange={(e) => setR({ ...r, ativo: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
        />
        Incluir nas buscas automáticas (&quot;Buscar todos&quot;)
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit">Salvar</Button>
      </div>
    </form>
  );
}

export default function ClientesPage() {
  const { ready, termos, intimacoes, adicionarTermo, atualizarTermo, excluirTermo, recarregar } = useStore();
  const { toast } = useToast();
  const { cobertura, recarregar: recarregarCobertura } = useCobertura();
  const [buscando, setBuscando] = useState(false);
  const temAutomaticos = termos.some((t) => t.ativo && AUTOMATICOS.includes(t.tipo));

  async function buscarAgora() {
    setBuscando(true);
    try {
      await recarregar();
      const r = await api<{ termos: { novas: number; erro?: string }[] }>("/api/comunica/ronda", { method: "POST" });
      await recarregar();
      await recarregarCobertura();
      const novas = r.termos.reduce((s, x) => s + x.novas, 0);
      const erros = r.termos.filter((x) => x.erro).length;
      toast(novas ? `${novas} intimação(ões) nova(s)` : "Nenhuma intimação nova", {
        tom: erros ? "error" : "success",
        descricao: erros ? `${erros} pesquisa(s) não terminaram; veja o aviso no cartão.` : undefined,
      });
    } catch (e) {
      toast("Não foi possível buscar agora", { tom: "error", descricao: e instanceof Error ? e.message : undefined });
    } finally {
      setBuscando(false);
    }
  }
  const [editando, setEditando] = useState<TermoMonitorado | "novo" | null>(null);
  const [excluir, setExcluir] = useState<TermoMonitorado | null>(null);

  if (!ready) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Clientes monitorados"
        description="Configure quais nomes, advogados, OABs ou processos devem ser pesquisados no Comunica PJe."
        actions={
          <>
            {temAutomaticos && (
              <Button variant="secondary" loading={buscando} icon={<RefreshCw className="h-4 w-4" />} onClick={buscarAgora}>
                Buscar OAB e processos agora
              </Button>
            )}
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditando("novo")}>
              Adicionar cliente
            </Button>
          </>
        }
      />

      <div className="mb-6">
        <Alert tone="info">
          Cada cliente vira uma pesquisa na API pública do Comunica PJe. As intimações encontradas ficam vinculadas ao nome do cliente, o que permite filtrar e
          analisar a carteira no painel. Os clientes por número de OAB ou de processo são pesquisados sozinhos, várias vezes ao dia; os por nome você pesquisa
          em Buscar no Comunica.
        </Alert>
      </div>

      {termos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Nenhum cliente configurado"
            description="Adicione o primeiro cliente para começar a buscar intimações."
            action={
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditando("novo")}>
                Adicionar cliente
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {termos.map((t) => {
            const qtd = intimacoes.filter((i) => i.cliente === t.apelido).length;
            return (
              <Card key={t.id} className={clsx("flex flex-col p-5", !t.ativo && "opacity-70")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-slate-900">{t.apelido}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">{TIPO_TERMO_LABEL[t.tipo]}</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={t.ativo}
                    aria-label={t.ativo ? "Desativar nas buscas" : "Ativar nas buscas"}
                    onClick={() => {
                      atualizarTermo(t.id, { ativo: !t.ativo });
                      toast(t.ativo ? `"${t.apelido}" desativado` : `"${t.apelido}" ativado`);
                    }}
                    className={clsx("relative h-6 w-11 shrink-0 rounded-full transition", t.ativo ? "bg-brand-600" : "bg-slate-300")}
                  >
                    <span className={clsx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", t.ativo ? "left-[22px]" : "left-0.5")} />
                  </button>
                </div>
                <p className="mt-3 break-words rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700">
                  {t.valor}
                  {t.tipo === "oab" && t.ufOab && `/${t.ufOab}`}
                </p>
                <StatusRonda t={t} lacunas={cobertura?.lacunas ?? []} />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {t.tribunal && <Badge className="bg-brand-50 text-brand-700">{t.tribunal}</Badge>}
                  <Link href={`/intimacoes?cliente=${encodeURIComponent(t.apelido)}`}>
                    <Badge className="hover:bg-slate-200">{qtd} intimação(ões)</Badge>
                  </Link>
                  <Link href={`/relatorios?cliente=${encodeURIComponent(t.apelido)}`}>
                    <Badge className="hover:bg-slate-200">Relatório</Badge>
                  </Link>
                </div>
                <div className="mt-4 flex items-center gap-1 border-t border-slate-100 pt-3">
                  <Link href={`/comunica?termo=${t.id}`} className="mr-auto">
                    <Button size="sm" variant="ghost" icon={<FileSearch className="h-4 w-4" />}>
                      Buscar agora
                    </Button>
                  </Link>
                  <button
                    onClick={() => setEditando(t)}
                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    aria-label="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => setExcluir(t)} className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!editando} onClose={() => setEditando(null)} title={editando === "novo" ? "Adicionar cliente" : "Editar cliente"}>
        {editando && (
          <FormTermo
            inicial={editando === "novo" ? VAZIO : editando}
            onCancelar={() => setEditando(null)}
            onSalvar={(r) => {
              if (editando === "novo") {
                adicionarTermo(r);
                toast("Cliente adicionado", { descricao: r.apelido });
              } else {
                atualizarTermo(editando.id, r);
                toast("Cliente atualizado");
              }
              setEditando(null);
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!excluir}
        onClose={() => setExcluir(null)}
        title="Remover cliente?"
        description={
          <>
            <strong>{excluir?.apelido}</strong> deixará de ser pesquisado. As intimações já importadas continuam no acervo.
          </>
        }
        confirmLabel="Remover"
        onConfirm={() => {
          if (excluir) excluirTermo(excluir.id);
          toast("Cliente removido");
        }}
      />
    </>
  );
}
