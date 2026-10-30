"use client";

import clsx from "clsx";
import { Check, CheckCircle2, FileText, ListChecks, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/auth/api";
import { referencia } from "@/lib/processos";
import { ordenarProvidencias, type Providencia, type ProvidenciasDoProcesso, SITUACAO_PROVIDENCIA_LABEL } from "@/lib/providencias";
import { mensagemDe, useApi } from "@/lib/use-api";
import { useProcessos } from "@/lib/use-processos";
import { diffDays, formatDate, formatDateTime, hojeISO } from "@/lib/utils";
import { SeletorResponsavel, SeloResponsavel } from "./equipe";
import { useToast } from "./toast";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Input, Spinner } from "./ui";

export function useProvidencias(processoId: string) {
  return useApi<{ providencias: ProvidenciasDoProcesso; disponivel: boolean }>(`/api/processos/${processoId}/providencias`);
}

function SeloPrazo({ prazo, feita }: { prazo?: string; feita: boolean }) {
  if (!prazo) return null;
  const dias = diffDays(hojeISO(), prazo);
  const cor = feita ? "bg-slate-100 text-slate-500" : dias < 0 ? "bg-red-50 text-red-700" : dias <= 3 ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600";
  return <Badge className={cor}>{feita ? formatDate(prazo) : dias < 0 ? `Venceu ${formatDate(prazo)}` : dias === 0 ? "Vence hoje" : `Até ${formatDate(prazo)}`}</Badge>;
}

/** Aba Providências do processo: lista com responsável, prazo e a página do PDF de onde saiu. */
export function ProvidenciasDoProcessoAba({ processoId, estado }: { processoId: string; estado: ReturnType<typeof useProvidencias> }) {
  const { toast } = useToast();
  const { dados, erro, setDados } = estado;
  const [lendo, setLendo] = useState(false);
  const [nova, setNova] = useState("");
  const [prazoNovo, setPrazoNovo] = useState("");
  const [historico, setHistorico] = useState<string>();
  const itens = ordenarProvidencias(dados?.providencias.itens ?? []);
  const sugeridas = itens.filter((p) => p.sugerida && p.situacao === "pendente").length;

  const aplicar = (providencias: ProvidenciasDoProcesso) => dados && setDados({ ...dados, providencias });

  async function extrair() {
    setLendo(true);
    try {
      const r = await api<{ providencias: ProvidenciasDoProcesso & { novas: number } }>(`/api/processos/${processoId}/providencias`, { body: { extrair: true } });
      aplicar(r.providencias);
      toast(r.providencias.novas ? `${r.providencias.novas} providência(s) sugerida(s). Confirme as que valem.` : "Nenhuma providência nova nos PDFs");
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    } finally {
      setLendo(false);
    }
  }

  async function incluir() {
    try {
      aplicar((await api<{ providencias: ProvidenciasDoProcesso }>(`/api/processos/${processoId}/providencias`, { body: { descricao: nova, prazo: prazoNovo || undefined } })).providencias);
      setNova("");
      setPrazoNovo("");
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    }
  }

  async function alterar(p: Providencia, corpo: Record<string, unknown>) {
    try {
      aplicar((await api<{ providencias: ProvidenciasDoProcesso }>(`/api/processos/${processoId}/providencias/${p.id}`, { method: "PATCH", body: corpo })).providencias);
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    }
  }

  async function excluir(p: Providencia) {
    try {
      aplicar((await api<{ providencias: ProvidenciasDoProcesso }>(`/api/processos/${processoId}/providencias/${p.id}`, { method: "DELETE" })).providencias);
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    }
  }

  return (
    <Card>
      <CardHeader
        title="Providências"
        subtitle="O que precisa ser feito no caso, com responsável e prazo. As sugeridas pela IA mostram a página do PDF de onde saíram e só valem depois de confirmadas."
        action={
          dados?.disponivel && (
            <Button size="sm" variant="secondary" icon={<Sparkles className="h-4 w-4" />} loading={lendo} onClick={() => void extrair()}>
              {lendo ? "Lendo os PDFs…" : "Sugerir pelos PDFs"}
            </Button>
          )
        }
      />
      <form
        className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (nova.trim()) void incluir();
        }}
      >
        <Input value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Nova providência (ex.: pedir ao cliente o comprovante de pagamento)" className="min-w-0 flex-1" aria-label="Nova providência" maxLength={500} />
        <Input type="date" value={prazoNovo} onChange={(e) => setPrazoNovo(e.target.value)} className="w-40" aria-label="Prazo" />
        <Button type="submit" icon={<Plus className="h-4 w-4" />} disabled={!nova.trim()}>
          Incluir
        </Button>
      </form>
      {sugeridas > 0 && (
        <div className="px-5 pt-4">
          <Alert tone="info">
            {sugeridas} sugestão(ões) da IA para conferir. Confirme com <Check className="inline h-3.5 w-3.5" aria-hidden /> ou descarte com <X className="inline h-3.5 w-3.5" aria-hidden />.
          </Alert>
        </div>
      )}
      {erro ? (
        <div className="p-5">
          <Alert>{erro}</Alert>
        </div>
      ) : !dados ? (
        <Spinner />
      ) : !itens.length ? (
        <EmptyState icon={<ListChecks className="h-6 w-6" />} title="Nenhuma providência" description="Inclua à mão ou peça à IA para ler os PDFs e sugerir o que fazer (contestar, juntar documento, pagar custas, preparar audiência)." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {itens.map((p) => {
            const fechada = p.situacao !== "pendente";
            return (
              <li key={p.id} className={clsx("px-5 py-3", p.sugerida && "bg-brand-50/40")}>
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    className={clsx("mt-0.5 shrink-0 rounded-full", p.situacao === "feita" ? "text-emerald-600" : "text-slate-300 hover:text-emerald-600")}
                    aria-label={p.situacao === "feita" ? "Reabrir" : "Marcar como feita"}
                    onClick={() => void alterar(p, { situacao: p.situacao === "feita" ? "pendente" : "feita" })}
                  >
                    <CheckCircle2 className="h-5 w-5" />
                  </button>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className={clsx("text-sm", fechada ? "text-slate-400 line-through" : "text-slate-900")}>{p.descricao}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {p.sugerida && <Badge className="bg-brand-100 text-brand-700">Sugerida pela IA</Badge>}
                      {p.situacao === "descartada" && <Badge>{SITUACAO_PROVIDENCIA_LABEL.descartada}</Badge>}
                      <SeloPrazo prazo={p.prazo} feita={fechada} />
                      {p.fundamento && <span>{p.fundamento}</span>}
                      {p.fonte && (
                        <a href={`/api/processos/${processoId}/documentos/${p.fonte.documentoId}#page=${p.fonte.pagina}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                          <FileText className="h-3.5 w-3.5" aria-hidden /> {p.fonte.documentoNome}, p. {p.fonte.pagina}
                        </a>
                      )}
                      <button type="button" className="hover:text-slate-800" onClick={() => setHistorico(historico === p.id ? undefined : p.id)}>
                        Histórico ({p.historico.length})
                      </button>
                    </div>
                    {historico === p.id && (
                      <ul className="mt-1 space-y-0.5 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                        {p.historico.map((h, i) => (
                          <li key={i}>
                            {formatDateTime(h.quando)} · {h.quem}: {h.acao}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    {!fechada && (
                      <>
                        <Input type="date" value={p.prazo ?? ""} onChange={(e) => void alterar(p, { prazo: e.target.value || null })} className="w-36" aria-label="Prazo" />
                        <SeletorResponsavel className="w-36" value={p.responsavelId} onChange={(id) => void alterar(p, { responsavelId: id })} aria-label="Responsável" />
                      </>
                    )}
                    {p.sugerida && (
                      <Button size="sm" variant="ghost" aria-label="Confirmar sugestão" icon={<Check className="h-4 w-4" />} onClick={() => void alterar(p, {})} />
                    )}
                    {p.situacao === "pendente" ? (
                      <Button size="sm" variant="ghost" aria-label="Descartar" icon={<X className="h-4 w-4" />} onClick={() => void alterar(p, { situacao: "descartada" })} />
                    ) : (
                      <Button size="sm" variant="ghost" aria-label="Reabrir" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void alterar(p, { situacao: "pendente" })} />
                    )}
                    <Button size="sm" variant="ghost" className="text-red-600" aria-label="Excluir" icon={<Trash2 className="h-4 w-4" />} onClick={() => void excluir(p)} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Providências confirmadas e pendentes de todos os processos, para a tela Hoje. */
export function ProvidenciasPendentes() {
  const { dados } = useApi<{ pendentes: { processoId: string; item: Providencia }[] }>("/api/providencias");
  const { processos } = useProcessos();
  if (!dados?.pendentes.length) return null;
  const nomes = new Map((processos ?? []).map((p) => [p.id, referencia(p)]));
  const lista = [...dados.pendentes].sort((a, b) => (a.item.prazo ?? "9999").localeCompare(b.item.prazo ?? "9999")).slice(0, 10);
  return (
    <Card className="mt-6">
      <CardHeader title="Providências dos processos" subtitle={`${dados.pendentes.length} pendente(s), das que têm prazo mais perto.`} />
      <ul className="divide-y divide-slate-100">
        {lista.map(({ processoId, item }) => (
          <li key={`${processoId}-${item.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <Link href={`/processos/${processoId}?aba=providencias`} className="text-sm text-slate-900 hover:text-brand-700">
                {item.descricao}
              </Link>
              <p className="text-xs text-slate-500">{nomes.get(processoId) ?? "Processo"}</p>
            </div>
            <SeloPrazo prazo={item.prazo} feita={false} />
            <SeloResponsavel id={item.responsavelId} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
