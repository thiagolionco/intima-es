"use client";

import clsx from "clsx";
import { Archive, BellRing, Check, ExternalLink, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { AbasBiblioteca } from "@/components/abas-rota";
import { SeletorResponsavel } from "@/components/equipe";
import { GuardarNaBiblioteca } from "@/components/guardar-na-biblioteca";
import { ConfirmDialog, Modal } from "@/components/modal";
import { SeletorProcessos } from "@/components/seletor-processos";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea } from "@/components/ui";
import { api } from "@/lib/auth/api";
import { type AlertaPrecedente, IMPACTO_ALERTA_LABEL, type MonitorPrecedentes, type StatusAlerta } from "@/lib/monitor";
import { AREA_LABEL, type AreaAtuacao } from "@/lib/processos";
import { useProcessos } from "@/lib/use-processos";
import { mensagemDe, useApi } from "@/lib/use-api";
import { formatDate, formatDateTime } from "@/lib/utils";

type Rascunho = { tema: string; descricao: string; area: AreaAtuacao | ""; tribunais: string; processoIds: string[]; frequenciaDias: number; ativo: boolean };
const VAZIO: Rascunho = { tema: "", descricao: "", area: "", tribunais: "", processoIds: [], frequenciaDias: 7, ativo: true };

const COR_IMPACTO = { alto: "bg-red-50 text-red-700", medio: "bg-amber-50 text-amber-800", baixo: "bg-slate-100 text-slate-600" } as const;

function FormMonitor({ monitor, aberto, onFechar, onSalvo }: { monitor?: MonitorPrecedentes; aberto: boolean; onFechar: () => void; onSalvo: () => void }) {
  const { toast } = useToast();
  const { processos } = useProcessos();
  const [r, setR] = useState<Rascunho>(VAZIO);
  const [visto, setVisto] = useState<unknown>();
  const [salvando, setSalvando] = useState(false);
  const chave = aberto ? (monitor ?? VAZIO) : undefined;
  if (chave !== visto) {
    setVisto(chave);
    if (monitor)
      setR({ tema: monitor.tema, descricao: monitor.descricao ?? "", area: monitor.area ?? "", tribunais: monitor.tribunais.join(", "), processoIds: monitor.processoIds, frequenciaDias: monitor.frequenciaDias, ativo: monitor.ativo });
    else if (chave) setR(VAZIO);
  }
  async function salvar() {
    setSalvando(true);
    try {
      const body = { ...r, area: r.area || undefined };
      await api(monitor ? `/api/monitores/${monitor.id}` : "/api/monitores", { method: monitor ? "PATCH" : "POST", body });
      toast(monitor ? "Tema salvo" : "Tema criado. A primeira pesquisa olha os últimos 90 dias.");
      onSalvo();
      onFechar();
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    } finally {
      setSalvando(false);
    }
  }
  return (
    <Modal
      open={aberto}
      onClose={() => !salvando && onFechar()}
      title={monitor ? "Editar tema" : "Novo tema para acompanhar"}
      footer={
        <>
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button loading={salvando} disabled={!r.tema.trim()} onClick={() => void salvar()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="-mx-5 max-h-[68vh] space-y-4 overflow-y-auto px-5">
        <Field label="Tema" htmlFor="mon-tema" required>
          <Input id="mon-tema" value={r.tema} maxLength={200} onChange={(e) => setR({ ...r, tema: e.target.value })} placeholder="Ex.: dano moral por negativação indevida; Tema 1.061/STJ" />
        </Field>
        <Field label="O que interessa" htmlFor="mon-desc" hint="A tese, o pedido ou o lado do cliente. Ajuda a IA a separar o que importa.">
          <Textarea id="mon-desc" rows={3} maxLength={1500} value={r.descricao} onChange={(e) => setR({ ...r, descricao: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Área" htmlFor="mon-area">
            <Select id="mon-area" value={r.area} onChange={(e) => setR({ ...r, area: e.target.value as AreaAtuacao | "" })}>
              <option value="">Qualquer</option>
              {Object.entries(AREA_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Frequência" htmlFor="mon-freq">
            <Select id="mon-freq" value={r.frequenciaDias} onChange={(e) => setR({ ...r, frequenciaDias: Number(e.target.value) })}>
              <option value={1}>Todo dia</option>
              <option value={7}>Toda semana</option>
              <option value={15}>A cada 15 dias</option>
              <option value={30}>Todo mês</option>
            </Select>
          </Field>
        </div>
        <Field label="Tribunais" htmlFor="mon-trib" hint="Siglas separadas por vírgula. Vazio: STF, STJ e TST.">
          <Input id="mon-trib" value={r.tribunais} onChange={(e) => setR({ ...r, tribunais: e.target.value })} placeholder="STJ, TJSP" />
        </Field>
        {processos && processos.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Processos afetados (opcional)</p>
            <SeletorProcessos id="mon-processos" processos={processos.filter((p) => !p.particular)} marcados={r.processoIds} onMudar={(ids) => setR({ ...r, processoIds: ids })} maximo={50} />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={r.ativo} onChange={(e) => setR({ ...r, ativo: e.target.checked })} /> Ligado
        </label>
      </div>
    </Modal>
  );
}

export default function MonitorPage() {
  const { dados, erro, recarregar } = useApi<{ monitores: MonitorPrecedentes[]; alertas: AlertaPrecedente[]; disponivel: boolean }>("/api/monitores");
  const { toast } = useToast();
  const [form, setForm] = useState<{ monitor?: MonitorPrecedentes }>();
  const [excluir, setExcluir] = useState<MonitorPrecedentes>();
  const [verificando, setVerificando] = useState<string>();
  const [filtro, setFiltro] = useState<StatusAlerta | "todos">("novo");
  const alertas = useMemo(() => (dados?.alertas ?? []).filter((a) => (filtro === "todos" ? a.status !== "arquivado" : a.status === filtro)), [dados, filtro]);

  async function verificar(m: MonitorPrecedentes) {
    setVerificando(m.id);
    try {
      const { alertas: novos } = await api<{ alertas: AlertaPrecedente[] }>(`/api/monitores/${m.id}/verificar`, { method: "POST" });
      toast(novos.length ? `${novos.length} novidade(s) sobre ${m.tema}` : `Nada novo sobre ${m.tema}`);
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    } finally {
      setVerificando(undefined);
      void recarregar();
    }
  }

  async function mudarAlerta(a: AlertaPrecedente, corpo: Record<string, unknown>) {
    try {
      await api(`/api/alertas/${a.id}`, { method: "PATCH", body: corpo });
      void recarregar();
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    }
  }

  return (
    <>
      <PageHeader
        title="Biblioteca"
        description="Temas que a IA acompanha nas fontes oficiais. Quando sai súmula, tema repetitivo, mudança de lei ou decisão importante, aparece aqui."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setForm({})}>
            Novo tema
          </Button>
        }
      />
      <AbasBiblioteca atual="monitor" />
      {erro ? (
        <Alert>{erro}</Alert>
      ) : !dados ? (
        <Spinner />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-1">
            {!dados.disponivel && <Alert tone="info">A pesquisa pela IA está desligada neste servidor (falta ANTHROPIC_API_KEY). Os temas ficam salvos, mas não são pesquisados.</Alert>}
            {!dados.monitores.length ? (
              <Card>
                <EmptyState icon={<BellRing className="h-6 w-6" />} title="Nenhum tema" description="Cadastre as teses que o escritório mais usa. A pesquisa roda sozinha na frequência escolhida." />
              </Card>
            ) : (
              dados.monitores.map((m) => (
                <Card key={m.id} className={clsx(!m.ativo && "opacity-60")}>
                  <div className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 font-medium text-slate-900">{m.tema}</p>
                      <div className="flex shrink-0">
                        <Button size="sm" variant="ghost" aria-label="Editar" icon={<Pencil className="h-4 w-4" />} onClick={() => setForm({ monitor: m })} />
                        <Button size="sm" variant="ghost" aria-label="Excluir" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={() => setExcluir(m)} />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      {m.tribunais.length ? m.tribunais.join(", ") : "STF, STJ e TST"} · a cada {m.frequenciaDias} dia(s)
                      {m.processoIds.length ? ` · ${m.processoIds.length} processo(s)` : ""}
                    </p>
                    <p className="text-xs text-slate-500">{m.ultimaVerificacao ? `Última pesquisa: ${formatDateTime(m.ultimaVerificacao)}` : "Ainda não pesquisado"}</p>
                    {m.ultimoErro && <p className="text-xs text-red-600">{m.ultimoErro}</p>}
                    {dados.disponivel && (
                      <Button size="sm" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={verificando === m.id} disabled={!!verificando} onClick={() => void verificar(m)}>
                        Pesquisar agora
                      </Button>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>

          <div className="lg:col-span-2">
            <Card>
              <CardHeader
                title="Novidades"
                action={
                  <Select value={filtro} onChange={(e) => setFiltro(e.target.value as StatusAlerta | "todos")} className="w-auto" aria-label="Mostrar">
                    <option value="novo">Novas</option>
                    <option value="lido">Lidas</option>
                    <option value="todos">Novas e lidas</option>
                    <option value="arquivado">Arquivadas</option>
                  </Select>
                }
              />
              {!alertas.length ? (
                <p className="px-5 py-6 text-sm text-slate-500">Nada por aqui.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {alertas.map((a) => (
                    <li key={a.id} className="space-y-2 px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={COR_IMPACTO[a.impacto]}>{IMPACTO_ALERTA_LABEL[a.impacto]}</Badge>
                        <span className="text-xs text-slate-500">
                          {a.tema}
                          {a.data ? ` · ${formatDate(a.data)}` : ""}
                          {a.tribunal ? ` · ${a.tribunal}` : ""}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-900">{a.titulo}</p>
                      <p className="text-sm text-slate-700">{a.resumo}</p>
                      {a.porQueImporta && <p className="text-sm text-slate-600">Por que importa: {a.porQueImporta}</p>}
                      <div className="flex flex-wrap items-center gap-2">
                        <a href={a.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                          Fonte oficial <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                        {a.status !== "lido" && (
                          <Button size="sm" variant="ghost" icon={<Check className="h-4 w-4" />} onClick={() => void mudarAlerta(a, { status: "lido" })}>
                            Marcar como lida
                          </Button>
                        )}
                        {a.status !== "arquivado" && (
                          <Button size="sm" variant="ghost" icon={<Archive className="h-4 w-4" />} onClick={() => void mudarAlerta(a, { status: "arquivado" })}>
                            Arquivar
                          </Button>
                        )}
                        <GuardarNaBiblioteca item={{ tipo: /s[úu]mula/i.test(a.referencia ?? a.titulo) ? "sumula" : "jurisprudencia", titulo: a.titulo, referencia: a.referencia, tribunal: a.tribunal, texto: a.resumo, link: a.url }} />
                        <SeletorResponsavel className="w-auto" value={a.responsavelId} onChange={(id) => void mudarAlerta(a, { responsavelId: id })} aria-label="Responsável" />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
      <FormMonitor aberto={!!form} monitor={form?.monitor} onFechar={() => setForm(undefined)} onSalvo={() => void recarregar()} />
      <ConfirmDialog
        open={!!excluir}
        onClose={() => setExcluir(undefined)}
        title="Excluir tema?"
        description={
          <>
            <strong>{excluir?.tema}</strong> deixa de ser pesquisado e as novidades dele são apagadas.
          </>
        }
        onConfirm={async () => {
          if (!excluir) return;
          try {
            await api(`/api/monitores/${excluir.id}`, { method: "DELETE" });
            toast("Tema excluído");
          } catch (e) {
            toast(mensagemDe(e), { tom: "error" });
          }
          void recarregar();
        }}
      />
    </>
  );
}
