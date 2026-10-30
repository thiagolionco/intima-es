"use client";

import clsx from "clsx";
import { AlertTriangle, Archive, Briefcase, Copy, Inbox, Link2, Mail, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SeletorResponsavel } from "@/components/equipe";
import { ConfirmDialog, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea } from "@/components/ui";
import { api } from "@/lib/auth/api";
import { type FormularioPedidos, LIMITES_PEDIDO, ORIGEM_PEDIDO_LABEL, type Pedido, STATUS_PEDIDO_LABEL, type StatusPedido, URGENCIA_LABEL } from "@/lib/pedidos";
import { AREA_LABEL } from "@/lib/processos";
import { useStore } from "@/lib/store";
import { mensagemDe, useApi } from "@/lib/use-api";
import { formatDateTime } from "@/lib/utils";

type Dados = { pedidos: Pedido[]; formulario: FormularioPedidos | null; triagemDisponivel: boolean };

const FILTROS: { id: "abertos" | StatusPedido | "todos"; rotulo: string }[] = [
  { id: "abertos", rotulo: "Em aberto" },
  { id: "novo", rotulo: "Novos" },
  { id: "respondido", rotulo: "Respondidos" },
  { id: "convertido", rotulo: "Viraram caso" },
  { id: "arquivado", rotulo: "Arquivados" },
  { id: "todos", rotulo: "Todos" },
];

const COR_URGENCIA = { alta: "bg-red-50 text-red-700", media: "bg-amber-50 text-amber-800", baixa: "bg-slate-100 text-slate-600" } as const;

const pareceEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

function NovoPedido({ aberto, onFechar, onCriado }: { aberto: boolean; onFechar: () => void; onCriado: (p: Pedido) => void }) {
  const { toast } = useToast();
  const [d, setD] = useState({ nome: "", contato: "", assunto: "", descricao: "" });
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true);
    try {
      onCriado((await api<{ pedido: Pedido }>("/api/pedidos", { body: d })).pedido);
      setD({ nome: "", contato: "", assunto: "", descricao: "" });
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
      title="Novo pedido"
      footer={
        <>
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button loading={salvando} disabled={!d.nome.trim() || !d.descricao.trim()} onClick={() => void salvar()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Para quem ligou, mandou mensagem ou veio ao escritório. Com a IA ligada, o pedido já chega triado.</p>
        <Field label="Nome" htmlFor="pedido-nome" required>
          <Input id="pedido-nome" value={d.nome} maxLength={LIMITES_PEDIDO.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} />
        </Field>
        <Field label="Contato (e-mail ou telefone)" htmlFor="pedido-contato">
          <Input id="pedido-contato" value={d.contato} maxLength={LIMITES_PEDIDO.contato} onChange={(e) => setD({ ...d, contato: e.target.value })} />
        </Field>
        <Field label="Assunto" htmlFor="pedido-assunto">
          <Input id="pedido-assunto" value={d.assunto} maxLength={LIMITES_PEDIDO.assunto} onChange={(e) => setD({ ...d, assunto: e.target.value })} />
        </Field>
        <Field label="O que a pessoa contou" htmlFor="pedido-descricao" required>
          <Textarea id="pedido-descricao" rows={6} value={d.descricao} maxLength={LIMITES_PEDIDO.descricao} onChange={(e) => setD({ ...d, descricao: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function CartaoFormulario({ formulario, onMudou }: { formulario: FormularioPedidos | null; onMudou: () => void }) {
  const { toast } = useToast();
  const { compartilhaExterno } = useStore();
  const [link, setLink] = useState<string>();
  const [gerando, setGerando] = useState(false);
  const [desligar, setDesligar] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [apresentacao, setApresentacao] = useState("");

  async function gerar() {
    setGerando(true);
    try {
      const r = await api<{ token: string }>("/api/pedidos/formulario", { body: { titulo: titulo || formulario?.titulo, apresentacao: apresentacao || formulario?.apresentacao } });
      setLink(`${window.location.origin}/pedido/${r.token}`);
      onMudou();
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    } finally {
      setGerando(false);
    }
  }

  const ativo = formulario?.ativo;
  return (
    <Card>
      <CardHeader
        title="Formulário de atendimento"
        subtitle={ativo ? `No ar desde ${formatDateTime(formulario!.criadoEm)} · ${formulario!.recebidos} pedido(s) recebido(s)` : "Um link para pôr no site, no Instagram ou na assinatura do e-mail. Quem preencher cai aqui, já triado."}
      />
      <div className="space-y-3 p-5">
        {link && (
          <Alert tone="info" title="Copie o link agora">
            <p className="break-all font-mono text-xs">{link}</p>
            <p className="mt-1">Por segurança, o Clepsa não mostra este link de novo. Se perder, gere outro (o antigo para de funcionar).</p>
            <Button size="sm" variant="secondary" className="mt-2" icon={<Copy className="h-4 w-4" />} onClick={() => void navigator.clipboard.writeText(link).then(() => toast("Link copiado"))}>
              Copiar link
            </Button>
          </Alert>
        )}
        {!compartilhaExterno ? (
          <p className="text-sm text-slate-500">Só o dono e os advogados do escritório criam links públicos.</p>
        ) : (
          <>
            <Field label="Título do formulário" htmlFor="form-titulo">
              <Input id="form-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={formulario?.titulo ?? "Conte o seu caso"} maxLength={120} />
            </Field>
            <Field label="Apresentação (opcional)" htmlFor="form-apresentacao">
              <Textarea id="form-apresentacao" rows={2} value={apresentacao} onChange={(e) => setApresentacao(e.target.value)} placeholder={formulario?.apresentacao ?? "Respondemos em até 2 dias úteis."} maxLength={600} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={<Link2 className="h-4 w-4" />} loading={gerando} onClick={() => void gerar()}>
                {ativo ? "Gerar link novo" : "Criar o link"}
              </Button>
              {ativo && (
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDesligar(true)}>
                  Desligar o formulário
                </Button>
              )}
            </div>
          </>
        )}
      </div>
      <ConfirmDialog
        open={desligar}
        onClose={() => setDesligar(false)}
        title="Desligar o formulário?"
        description="O link para de funcionar na hora. Os pedidos já recebidos continuam aqui."
        onConfirm={async () => {
          try {
            await api("/api/pedidos/formulario", { method: "DELETE" });
            setLink(undefined);
            onMudou();
          } catch (e) {
            toast(mensagemDe(e), { tom: "error" });
          }
        }}
      />
    </Card>
  );
}

function DetalhePedido({ pedido, triagemDisponivel, onTrocar, onExcluido }: { pedido: Pedido; triagemDisponivel: boolean; onTrocar: (p: Pedido) => void; onExcluido: () => void }) {
  const { toast } = useToast();
  const { podeExcluir } = useStore();
  const [triando, setTriando] = useState(false);
  const [redigindo, setRedigindo] = useState(false);
  const [convertendo, setConvertendo] = useState(false);
  const [resposta, setResposta] = useState<{ id: string; texto: string }>();
  const [excluir, setExcluir] = useState(false);
  const t = pedido.triagem;

  async function alterar(corpo: Record<string, unknown>) {
    try {
      onTrocar((await api<{ pedido: Pedido }>(`/api/pedidos/${pedido.id}`, { method: "PATCH", body: corpo })).pedido);
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    }
  }

  async function triar() {
    setTriando(true);
    try {
      onTrocar((await api<{ pedido: Pedido }>(`/api/pedidos/${pedido.id}/triagem`, { method: "POST" })).pedido);
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    } finally {
      setTriando(false);
    }
  }

  async function redigir() {
    setRedigindo(true);
    try {
      setResposta({ id: pedido.id, texto: (await api<{ texto: string }>(`/api/pedidos/${pedido.id}/resposta`, { method: "POST" })).texto });
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    } finally {
      setRedigindo(false);
    }
  }

  async function converter() {
    setConvertendo(true);
    try {
      const r = await api<{ pedido: Pedido; processo: { id: string } }>(`/api/pedidos/${pedido.id}/converter`, { method: "POST" });
      onTrocar(r.pedido);
      toast("Caso criado em triagem", { descricao: "Abra o processo para completar os dados." });
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    } finally {
      setConvertendo(false);
    }
  }

  const textoResposta = resposta?.id === pedido.id ? resposta.texto : undefined;

  return (
    <Card>
      <CardHeader
        title={pedido.assunto || `Pedido de ${pedido.nome}`}
        subtitle={`${ORIGEM_PEDIDO_LABEL[pedido.origem]} · ${formatDateTime(pedido.criadoEm)}`}
        action={
          podeExcluir && <Button size="sm" variant="ghost" className="text-red-600" aria-label="Excluir pedido" icon={<Trash2 className="h-4 w-4" />} onClick={() => setExcluir(true)} />
        }
      />
      <div className="space-y-5 p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Nome</dt>
            <dd className="mt-0.5 text-slate-800">{pedido.nome}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Contato</dt>
            <dd className="mt-0.5 break-all text-slate-800">{pedido.contato || "—"}</dd>
          </div>
        </dl>
        <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">{pedido.descricao}</p>

        {t ? (
          <div className="space-y-2 rounded-lg border border-brand-100 bg-brand-50/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-600" aria-hidden />
              <span className="text-sm font-medium text-slate-900">Triagem da IA</span>
              <Badge className={COR_URGENCIA[t.urgencia]}>Urgência {URGENCIA_LABEL[t.urgencia].toLowerCase()}</Badge>
              {t.area && <Badge className="bg-brand-50 text-brand-700">{AREA_LABEL[t.area]}</Badge>}
            </div>
            <p className="text-sm text-slate-700">{t.resumo}</p>
            {t.alertaPrazo && (
              <p className="flex items-start gap-1.5 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {t.alertaPrazo}
              </p>
            )}
            {t.perguntas.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500">Perguntar antes de aceitar</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                  {t.perguntas.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          triagemDisponivel && (
            <Button size="sm" variant="secondary" icon={<Sparkles className="h-4 w-4" />} ia loading={triando} onClick={() => void triar()}>
              Triar com a IA
            </Button>
          )
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Situação" htmlFor="pedido-status">
            <Select id="pedido-status" value={pedido.status} onChange={(e) => void alterar({ status: e.target.value })}>
              {Object.entries(STATUS_PEDIDO_LABEL)
                .filter(([v]) => v !== "convertido" || pedido.status === "convertido")
                .map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Responsável" htmlFor="pedido-responsavel">
            <SeletorResponsavel id="pedido-responsavel" value={pedido.responsavelId} onChange={(id) => void alterar({ responsavelId: id })} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          {pedido.processoId ? (
            <Link href={`/processos/${pedido.processoId}`}>
              <Button size="sm" icon={<Briefcase className="h-4 w-4" />}>
                Abrir o caso
              </Button>
            </Link>
          ) : (
            <Button size="sm" icon={<Briefcase className="h-4 w-4" />} loading={convertendo} onClick={() => void converter()}>
              Virar caso
            </Button>
          )}
          {triagemDisponivel && (
            <Button size="sm" variant="secondary" icon={<Mail className="h-4 w-4" />} ia loading={redigindo} onClick={() => void redigir()}>
              Rascunho da resposta
            </Button>
          )}
          {pedido.status !== "arquivado" && (
            <Button size="sm" variant="ghost" icon={<Archive className="h-4 w-4" />} onClick={() => void alterar({ status: "arquivado" })}>
              Arquivar
            </Button>
          )}
        </div>

        {textoResposta && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Rascunho da resposta (nada foi enviado)</p>
            <p className="whitespace-pre-wrap rounded-lg border border-slate-200 p-4 text-sm leading-relaxed text-slate-800">{textoResposta}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => void navigator.clipboard.writeText(textoResposta).then(() => toast("Resposta copiada"))}>
                Copiar
              </Button>
              {pareceEmail(pedido.contato) && (
                <a href={`mailto:${pedido.contato.trim()}?subject=${encodeURIComponent(`Re: ${pedido.assunto || "seu pedido"}`)}&body=${encodeURIComponent(textoResposta)}`}>
                  <Button size="sm" variant="secondary" icon={<Mail className="h-4 w-4" />}>
                    Abrir no e-mail
                  </Button>
                </a>
              )}
              <Button size="sm" variant="ghost" onClick={() => void alterar({ status: "respondido" })}>
                Marcar como respondido
              </Button>
            </div>
          </div>
        )}

        {pedido.historico.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs font-medium text-slate-500">Histórico ({pedido.historico.length})</summary>
            <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
              {pedido.historico.map((h, i) => (
                <li key={i}>
                  {formatDateTime(h.quando)} · {h.quem}: {h.acao}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <ConfirmDialog
        open={excluir}
        onClose={() => setExcluir(false)}
        title="Excluir pedido?"
        description="O relato e a triagem são apagados. Se virou caso, o processo continua."
        onConfirm={async () => {
          try {
            await api(`/api/pedidos/${pedido.id}`, { method: "DELETE" });
            onExcluido();
          } catch (e) {
            toast(mensagemDe(e), { tom: "error" });
          }
        }}
      />
    </Card>
  );
}

export default function PedidosPage() {
  const { dados, erro, recarregar, setDados } = useApi<Dados>("/api/pedidos");
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("abertos");
  const [selecionado, setSelecionado] = useState<string>();
  const [novo, setNovo] = useState(false);

  const lista = useMemo(() => {
    const todos = dados?.pedidos ?? [];
    if (filtro === "todos") return todos;
    if (filtro === "abertos") return todos.filter((p) => p.status === "novo" || p.status === "em_analise");
    return todos.filter((p) => p.status === filtro);
  }, [dados, filtro]);
  const atual = dados?.pedidos.find((p) => p.id === selecionado) ?? lista[0];

  const trocar = (p: Pedido) => setDados((d) => d && { ...d, pedidos: d.pedidos.map((x) => (x.id === p.id ? p : x)) });

  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Quem quer falar com o escritório: o formulário de atendimento, as mensagens do portal do cliente e os contatos anotados à mão. A IA tria a urgência, a área e o que perguntar."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setNovo(true)}>
            Novo pedido
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filtrar pedidos">
        {FILTROS.map((f) => {
          const n = f.id === "abertos" ? dados?.pedidos.filter((p) => p.status === "novo" || p.status === "em_analise").length : f.id === "todos" ? dados?.pedidos.length : dados?.pedidos.filter((p) => p.status === f.id).length;
          return (
            <button
              key={f.id}
              role="tab"
              aria-selected={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              className={clsx("rounded-full px-3 py-1 text-sm", filtro === f.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
            >
              {f.rotulo}
              {n !== undefined && <span className="ml-1.5 opacity-75">{n}</span>}
            </button>
          );
        })}
      </div>

      {erro ? (
        <Alert>{erro}</Alert>
      ) : !dados ? (
        <Spinner />
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              {!lista.length ? (
                <EmptyState icon={<Inbox className="h-6 w-6" />} title="Nenhum pedido aqui" description="Crie o link do formulário ao lado e divulgue, ou anote à mão quem ligou." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {lista.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setSelecionado(p.id)} className={clsx("block w-full px-4 py-3 text-left hover:bg-slate-50", atual?.id === p.id && "bg-brand-50/60")}>
                        <div className="flex items-center gap-2">
                          {p.status === "novo" && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Novo" />}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{p.assunto || p.nome}</span>
                          {p.triagem && <Badge className={COR_URGENCIA[p.triagem.urgencia]}>{URGENCIA_LABEL[p.triagem.urgencia]}</Badge>}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {p.nome} · {ORIGEM_PEDIDO_LABEL[p.origem]} · {formatDateTime(p.criadoEm)}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">{STATUS_PEDIDO_LABEL[p.status]}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <CartaoFormulario formulario={dados.formulario} onMudou={() => void recarregar()} />
          </div>
          <div className="lg:col-span-3">
            {atual ? (
              <DetalhePedido
                key={atual.id}
                pedido={atual}
                triagemDisponivel={dados.triagemDisponivel}
                onTrocar={trocar}
                onExcluido={() => {
                  setSelecionado(undefined);
                  setDados((d) => d && { ...d, pedidos: d.pedidos.filter((x) => x.id !== atual.id) });
                }}
              />
            ) : null}
          </div>
        </div>
      )}

      <NovoPedido
        aberto={novo}
        onFechar={() => setNovo(false)}
        onCriado={(p) => {
          setDados((d) => d && { ...d, pedidos: [p, ...d.pedidos] });
          setSelecionado(p.id);
          setFiltro("todos");
        }}
      />
    </>
  );
}
