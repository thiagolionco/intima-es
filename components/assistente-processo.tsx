"use client";

import clsx from "clsx";
import { Bot, CheckCircle2, Circle, Copy, FileText, Loader2, Play, SkipForward, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/auth/api";
import { ACAO_AGENTE_LABEL, type ExecucaoAgente, LIMITES_AGENTE, type PassoAgente } from "@/lib/agente";
import { mensagemDe, useApi } from "@/lib/use-api";
import { formatDateTime } from "@/lib/utils";
import { BotaoWord } from "./editor-ia";
import { ConfirmDialog } from "./modal";
import { useToast } from "./toast";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Spinner, Textarea } from "./ui";

const EXEMPLOS = [
  "Prepare o caso para a reunião com o cliente: risco, linha do tempo e o que falta fazer.",
  "Pesquise a jurisprudência do STJ sobre o tema principal e redija o rascunho do parecer com as citações conferidas.",
  "Escreva uma atualização curta para o cliente sobre o andamento do processo.",
];

function IconePasso({ passo, rodando }: { passo: PassoAgente; rodando: boolean }) {
  if (rodando) return <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-label="Executando" />;
  if (passo.estado === "feito") return <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Feito" />;
  if (passo.estado === "erro") return <XCircle className="h-5 w-5 text-red-600" aria-label="Erro" />;
  if (passo.estado === "pulado") return <SkipForward className="h-5 w-5 text-slate-400" aria-label="Pulado" />;
  return <Circle className="h-5 w-5 text-slate-300" aria-label="Pendente" />;
}

/**
 * Aba Assistente do processo: o advogado pede em linguagem comum, a IA monta um plano com as
 * ferramentas do Clepsa (risco, linha do tempo, providências, pesquisa, parecer, citações, atualização
 * ao cliente), executa um passo por vez sob o olho do advogado e no fim revisa se o pedido foi atendido.
 */
export function AssistenteDoProcesso({ processoId, titulo, onAbrirParecer, onMudou }: { processoId: string; titulo: string; onAbrirParecer: (texto: string) => void; onMudou?: () => void }) {
  const { toast } = useToast();
  const { dados, erro, setDados } = useApi<{ execucoes: ExecucaoAgente[]; disponivel: boolean }>(`/api/processos/${processoId}/assistente`);
  const [pedido, setPedido] = useState("");
  const [planejando, setPlanejando] = useState(false);
  const [rodando, setRodando] = useState<string>();
  const [entregando, setEntregando] = useState(false);
  const [selecionada, setSelecionada] = useState<string>();
  const [excluir, setExcluir] = useState<ExecucaoAgente>();

  const execucoes = dados?.execucoes ?? [];
  const exec = execucoes.find((e) => e.id === selecionada) ?? execucoes[0];

  const trocar = (nova: ExecucaoAgente) => setDados((d) => d && { ...d, execucoes: [nova, ...d.execucoes.filter((e) => e.id !== nova.id)] });

  async function planejar() {
    setPlanejando(true);
    try {
      const r = await api<{ execucao: ExecucaoAgente }>(`/api/processos/${processoId}/assistente`, { body: { pedido } });
      trocar(r.execucao);
      setSelecionada(r.execucao.id);
      setPedido("");
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    } finally {
      setPlanejando(false);
    }
  }

  async function passo(e: ExecucaoAgente, p: PassoAgente, pular = false): Promise<ExecucaoAgente | undefined> {
    setRodando(p.id);
    try {
      const r = await api<{ execucao: ExecucaoAgente }>(`/api/processos/${processoId}/assistente/${e.id}/passos/${p.id}`, { body: { pular } });
      trocar(r.execucao);
      if (!pular) onMudou?.();
      return r.execucao;
    } catch (err) {
      toast(mensagemDe(err), { tom: "error" });
    } finally {
      setRodando(undefined);
    }
  }

  /** Um pedido por passo, para cada um caber no tempo de uma requisição. Para no primeiro erro. */
  async function executarTodos(e: ExecucaoAgente) {
    let atual: ExecucaoAgente | undefined = e;
    for (;;) {
      const prox: PassoAgente | undefined = atual?.passos.find((p) => p.estado === "pendente");
      if (!atual || !prox) break;
      atual = await passo(atual, prox);
      if (atual?.passos.find((p) => p.id === prox.id)?.estado === "erro") break;
    }
  }

  async function entregar(e: ExecucaoAgente) {
    setEntregando(true);
    try {
      trocar((await api<{ execucao: ExecucaoAgente }>(`/api/processos/${processoId}/assistente/${e.id}/entregar`, { method: "POST" })).execucao);
    } catch (err) {
      toast(mensagemDe(err), { tom: "error" });
    } finally {
      setEntregando(false);
    }
  }

  const copiar = (t: string) => void navigator.clipboard.writeText(t).then(() => toast("Texto copiado"));

  if (erro) return <Alert>{erro}</Alert>;
  if (!dados) return <Spinner />;
  if (!dados.disponivel)
    return (
      <Card>
        <EmptyState icon={<Bot className="h-6 w-6" />} title="Assistente desligado" description="O assistente usa a IA do Clepsa. Peça ao responsável pelo sistema para configurar a chave da Anthropic." />
      </Card>
    );

  const pendentes = exec?.passos.filter((p) => p.estado === "pendente").length ?? 0;
  const ocupado = !!rodando || entregando;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader title="Pedir ao assistente" subtitle="Diga o que precisa. O assistente propõe um plano com as ferramentas do Clepsa; nada roda antes de você mandar." />
          <form
            className="space-y-3 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (pedido.trim()) void planejar();
            }}
          >
            <Textarea rows={3} value={pedido} maxLength={LIMITES_AGENTE.pedido} onChange={(e) => setPedido(e.target.value)} placeholder="Ex.: prepare o caso para a audiência de amanhã" aria-label="Pedido ao assistente" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {EXEMPLOS.map((x) => (
                  <button key={x} type="button" className="rounded-full bg-slate-100 px-3 py-1 text-left text-xs text-slate-600 hover:bg-slate-200" onClick={() => setPedido(x)}>
                    {x.length > 60 ? `${x.slice(0, 58)}…` : x}
                  </button>
                ))}
              </div>
              <Button type="submit" icon={<Bot className="h-4 w-4" />} loading={planejando} disabled={!pedido.trim()}>
                {planejando ? "Montando o plano…" : "Montar plano"}
              </Button>
            </div>
          </form>
        </Card>

        {exec && (
          <Card>
            <CardHeader
              title={exec.pedido.length > 90 ? `${exec.pedido.slice(0, 88)}…` : exec.pedido}
              subtitle={`${exec.autorNome} · ${formatDateTime(exec.criadoEm)}`}
              action={
                pendentes > 0 && (
                  <Button size="sm" icon={<Play className="h-4 w-4" />} loading={!!rodando} disabled={ocupado} onClick={() => void executarTodos(exec)}>
                    {rodando ? "Executando…" : pendentes === exec.passos.length ? "Executar o plano" : "Continuar"}
                  </Button>
                )
              }
            />
            {exec.explicacao && <p className="border-b border-slate-100 px-5 py-3 text-sm text-slate-600">{exec.explicacao}</p>}
            <ol className="divide-y divide-slate-100">
              {exec.passos.map((p, i) => (
                <li key={p.id} className={clsx("px-5 py-3", p.estado === "pulado" && "opacity-60")}>
                  <div className="flex items-start gap-3">
                    <IconePasso passo={p} rodando={rodando === p.id} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium text-slate-900">
                        {i + 1}. {ACAO_AGENTE_LABEL[p.acao]}
                      </p>
                      <p className="text-xs text-slate-500">{p.objetivo}</p>
                      {p.resumo && <p className="text-sm text-slate-700">{p.resumo}</p>}
                      {p.erro && <p className="text-sm text-red-700">{p.erro}</p>}
                      {p.texto && (
                        <details className="rounded-lg border border-slate-200">
                          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-600">Ver o texto produzido</summary>
                          <p className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words border-t border-slate-100 px-3 py-2 text-sm leading-relaxed text-slate-700">{p.texto}</p>
                          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-3 py-2">
                            {p.acao === "redigir_parecer" && (
                              <Button size="sm" icon={<FileText className="h-4 w-4" />} onClick={() => onAbrirParecer(p.texto!)}>
                                Abrir no editor do parecer
                              </Button>
                            )}
                            {p.acao === "resumo_cliente" && <BotaoWord titulo={titulo} subtitulo="Atualização para o cliente" texto={p.texto} />}
                            <Button size="sm" variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => copiar(p.texto!)}>
                              Copiar
                            </Button>
                          </div>
                        </details>
                      )}
                    </div>
                    {(p.estado === "pendente" || p.estado === "erro") && (
                      <div className="flex shrink-0 gap-1">
                        <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => void passo(exec, p)}>
                          {p.estado === "erro" ? "Tentar de novo" : "Executar"}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => void passo(exec, p, true)}>
                          Pular
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            {!pendentes && (
              <div className="space-y-3 border-t border-slate-100 p-5">
                {exec.entrega ? (
                  <>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">Entrega</p>
                      <Badge className={exec.entrega.atendeu ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}>{exec.entrega.atendeu ? "Pedido atendido" : "Atendido em parte"}</Badge>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{exec.entrega.texto}</p>
                    {exec.entrega.pendencias.length > 0 && (
                      <Alert tone="warning" title="Para conferir">
                        <ul className="list-disc pl-4">
                          {exec.entrega.pendencias.map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                      </Alert>
                    )}
                  </>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-slate-600">Todos os passos terminaram. O assistente revisa o que foi feito contra o seu pedido e aponta o que falta.</p>
                    <Button loading={entregando} disabled={ocupado} onClick={() => void entregar(exec)}>
                      Revisar e entregar
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}
      </div>

      <Card>
        <CardHeader title="Pedidos anteriores" subtitle={execucoes.length ? `${execucoes.length} neste processo` : undefined} />
        {!execucoes.length ? (
          <p className="px-5 py-4 text-sm text-slate-500">Nenhum pedido ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {execucoes.map((e) => (
              <li key={e.id} className={clsx("flex items-start gap-2 px-5 py-3", exec?.id === e.id && "bg-brand-50/50")}>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelecionada(e.id)}>
                  <p className="line-clamp-2 text-sm text-slate-800">{e.pedido}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDateTime(e.criadoEm)} · {e.passos.filter((p) => p.estado === "feito").length}/{e.passos.length} passos
                    {e.entrega && " · entregue"}
                  </p>
                </button>
                <Button size="sm" variant="ghost" className="text-red-600" aria-label="Excluir pedido" icon={<Trash2 className="h-4 w-4" />} disabled={ocupado} onClick={() => setExcluir(e)} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={!!excluir}
        onClose={() => setExcluir(undefined)}
        title="Excluir este pedido?"
        description="Apaga o plano e os textos do assistente. O que ele já gravou no processo (linha do tempo, providências, análise) continua lá."
        onConfirm={async () => {
          if (!excluir) return;
          try {
            await api(`/api/processos/${processoId}/assistente/${excluir.id}`, { method: "DELETE" });
            setDados((d) => d && { ...d, execucoes: d.execucoes.filter((x) => x.id !== excluir.id) });
          } catch (e) {
            toast(mensagemDe(e), { tom: "error" });
          }
        }}
      />
    </div>
  );
}
