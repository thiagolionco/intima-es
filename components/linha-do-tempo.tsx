"use client";

import clsx from "clsx";
import { Copy, Eye, EyeOff, FileText, History, Mail, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/auth/api";
import {
  cronologiaEmTexto,
  type EventoLinhaDoTempo,
  type FatosDoProcesso,
  LIMITES_NOTA,
  montarLinhaDoTempo,
  type NotaProcesso,
  ORIGEM_EVENTO_LABEL,
  type OrigemEvento,
  TIPO_NOTA_LABEL,
} from "@/lib/linha-do-tempo";
import type { AnaliseRisco, ParecerProcesso, Processo } from "@/lib/processos";
import type { Intimacao } from "@/lib/types";
import { mensagemDe, useApi } from "@/lib/use-api";
import { formatDate, hojeISO } from "@/lib/utils";
import { ConfirmDialog, Modal } from "./modal";
import type { useMovimentacoes } from "./movimentacoes-processo";
import { useToast } from "./toast";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, Spinner, Textarea } from "./ui";

const COR: Record<OrigemEvento, string> = {
  andamento: "bg-sky-500",
  intimacao: "bg-amber-500",
  fato: "bg-violet-500",
  nota: "bg-emerald-500",
  escritorio: "bg-slate-400",
};

const FUSO = { timeZone: "America/Sao_Paulo" } as const;
const quando = (iso: string) => (iso.length <= 10 ? formatDate(iso) : new Date(iso).toLocaleString("pt-BR", { ...FUSO, dateStyle: "short", timeStyle: "short" }));

/** Fatos e notas do processo, lidos do servidor. */
export function useLinhaDoTempo(processoId: string) {
  return useApi<{ fatos: FatosDoProcesso | null; notas: NotaProcesso[]; disponivel: boolean }>(`/api/processos/${processoId}/linha-do-tempo`);
}

function NovaNota({ processoId, aberto, onFechar, onSalva, iaLigada }: { processoId: string; aberto: boolean; onFechar: () => void; onSalva: () => void; iaLigada: boolean }) {
  const { toast } = useToast();
  const [tipo, setTipo] = useState<NotaProcesso["tipo"]>("email");
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [data, setData] = useState(hojeISO());
  const [resumir, setResumir] = useState(true);
  const [visivel, setVisivel] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      await api(`/api/processos/${processoId}/notas`, { body: { tipo, titulo, texto, data, resumir: iaLigada && resumir, visivelAoCliente: visivel } });
      toast("Guardado na linha do tempo");
      setTitulo("");
      setTexto("");
      onSalva();
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
      title="Colar e-mail ou anotação"
      footer={
        <>
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button loading={salvando} disabled={!texto.trim()} onClick={() => void salvar()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="-mx-5 max-h-[68vh] space-y-4 overflow-y-auto px-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo" htmlFor="nota-tipo">
            <Select id="nota-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as NotaProcesso["tipo"])}>
              {Object.entries(TIPO_NOTA_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data" htmlFor="nota-data">
            <Input id="nota-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </Field>
        </div>
        <Field label="Assunto" htmlFor="nota-titulo" hint="Se deixar vazio, usamos a primeira linha do texto.">
          <Input id="nota-titulo" value={titulo} maxLength={LIMITES_NOTA.titulo} onChange={(e) => setTitulo(e.target.value)} />
        </Field>
        <Field label="Texto" htmlFor="nota-texto" required hint="Cole o e-mail inteiro (com a conversa) ou escreva o que foi tratado.">
          <Textarea id="nota-texto" rows={10} value={texto} maxLength={LIMITES_NOTA.texto} onChange={(e) => setTexto(e.target.value)} />
        </Field>
        {iaLigada && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={resumir} onChange={(e) => setResumir(e.target.checked)} />
            Pedir à IA um resumo e as próximas ações
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={visivel} onChange={(e) => setVisivel(e.target.checked)} />
          Mostrar no portal do cliente
        </label>
      </div>
    </Modal>
  );
}

/**
 * Aba Linha do tempo do processo: andamentos do DataJud, intimações, fatos tirados dos PDFs pela
 * IA, e-mails e anotações coladas e o que o escritório fez (pareceres, análises). Substitui a
 * antiga aba Andamentos, que vive aqui no filtro "Andamentos".
 */
export function LinhaDoTempoDoProcesso({
  processo,
  estado,
  andamentos,
  intimacoes,
  pareceres,
  analises,
  filtroInicial,
}: {
  processo: Processo;
  estado: ReturnType<typeof useLinhaDoTempo>;
  andamentos: ReturnType<typeof useMovimentacoes>;
  intimacoes: Intimacao[];
  pareceres?: ParecerProcesso[];
  analises?: AnaliseRisco[];
  filtroInicial?: OrigemEvento;
}) {
  const { toast } = useToast();
  const { dados, erro, recarregar } = estado;
  const [filtros, setFiltros] = useState<OrigemEvento[]>(filtroInicial ? [filtroInicial] : []);
  const [lendo, setLendo] = useState(false);
  const [nova, setNova] = useState(false);
  const [excluir, setExcluir] = useState<NotaProcesso>();
  const [aberta, setAberta] = useState<string>();

  const eventos = useMemo(
    () =>
      montarLinhaDoTempo({
        movimentacoes: andamentos.dados,
        intimacoes,
        fatos: dados?.fatos,
        notas: dados?.notas,
        pareceres,
        analises,
        dataAtendimento: processo.dataAtendimento,
        dataProtocolo: processo.dataProtocolo,
      }),
    [andamentos.dados, intimacoes, dados, pareceres, analises, processo.dataAtendimento, processo.dataProtocolo],
  );
  const contagem = useMemo(() => {
    const c = {} as Record<OrigemEvento, number>;
    for (const e of eventos) c[e.origem] = (c[e.origem] ?? 0) + 1;
    return c;
  }, [eventos]);
  const visiveis = filtros.length ? eventos.filter((e) => filtros.includes(e.origem)) : eventos;
  const notaPorId = new Map(dados?.notas.map((n) => [n.id, n]));

  async function lerFatos() {
    setLendo(true);
    try {
      const r = await api<{ fatos: FatosDoProcesso }>(`/api/processos/${processo.id}/linha-do-tempo`, { method: "POST" });
      toast(`${r.fatos.fatos.length} fato(s) com data tirado(s) dos PDFs`);
      void recarregar();
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    } finally {
      setLendo(false);
    }
  }

  async function copiar() {
    const texto = cronologiaEmTexto(visiveis);
    try {
      await navigator.clipboard.writeText(texto);
      toast("Cronologia copiada");
    } catch {
      toast("Não foi possível copiar", { tom: "error" });
    }
  }

  async function alternarVisivel(n: NotaProcesso) {
    try {
      await api(`/api/processos/${processo.id}/notas/${n.id}`, { method: "PATCH", body: { visivelAoCliente: !n.visivelAoCliente } });
      toast(n.visivelAoCliente ? "Não aparece mais no portal" : "Aparece no portal do cliente");
      void recarregar();
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    }
  }

  const acoes = (
    <div className="flex flex-wrap justify-end gap-2">
      <Button size="sm" variant="secondary" icon={<Mail className="h-4 w-4" />} onClick={() => setNova(true)}>
        Colar e-mail ou anotação
      </Button>
      {dados?.disponivel && (
        <Button size="sm" variant="secondary" icon={<Sparkles className="h-4 w-4" />} ia loading={lendo} onClick={() => void lerFatos()}>
          {dados.fatos ? "Ler os PDFs de novo" : "Tirar fatos dos PDFs"}
        </Button>
      )}
      {andamentos.disponivel && (
        <Button size="sm" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={andamentos.consultando} onClick={() => void andamentos.consultar()}>
          Consultar DataJud
        </Button>
      )}
      <Button size="sm" variant="ghost" icon={<Copy className="h-4 w-4" />} disabled={!visiveis.length} onClick={() => void copiar()}>
        Copiar cronologia
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader
        title="Linha do tempo"
        subtitle="Tudo o que aconteceu no processo, do mais novo para o mais antigo, com a origem de cada item. Os andamentos do DataJud chegam com alguns dias de atraso: confira no tribunal antes de contar prazo."
        action={acoes}
      />
      <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
        {(Object.keys(ORIGEM_EVENTO_LABEL) as OrigemEvento[]).map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={filtros.includes(o)}
            onClick={() => setFiltros((f) => (f.includes(o) ? f.filter((x) => x !== o) : [...f, o]))}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
              filtros.includes(o) ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50",
            )}
          >
            <span className={clsx("h-2 w-2 rounded-full", COR[o])} aria-hidden />
            {ORIGEM_EVENTO_LABEL[o]} ({contagem[o] ?? 0})
          </button>
        ))}
      </div>
      {andamentos.dados?.erro && (
        <div className="px-5 pt-4">
          <Alert tone="warning">A última consulta ao DataJud falhou: {andamentos.dados.erro}</Alert>
        </div>
      )}
      {erro ? (
        <div className="p-5">
          <Alert>{erro}</Alert>
        </div>
      ) : !dados || andamentos.dados === undefined ? (
        <Spinner />
      ) : !visiveis.length ? (
        <EmptyState
          icon={<History className="h-6 w-6" />}
          title={eventos.length ? "Nada com este filtro" : "Nada na linha do tempo ainda"}
          description={
            eventos.length
              ? "Desmarque o filtro acima para ver os outros itens do processo."
              : "Os andamentos do DataJud e as intimações do Comunica entram sozinhos. Anexe os PDFs e peça à IA os fatos com data, ou cole os e-mails trocados com o cliente."
          }
        />
      ) : (
        <ol className="relative px-5 py-4">
          {visiveis.map((ev: EventoLinhaDoTempo) => {
            const nota = ev.notaId ? notaPorId.get(ev.notaId) : undefined;
            const expandida = aberta === ev.id;
            return (
              <li key={ev.id} className="relative flex gap-4 pb-5 last:pb-0">
                <span className="absolute left-[5px] top-3 h-full w-px bg-slate-200" aria-hidden />
                <span className={clsx("relative mt-1.5 h-3 w-3 shrink-0 rounded-full ring-4 ring-white", COR[ev.origem])} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">
                    {quando(ev.quando)} · {ORIGEM_EVENTO_LABEL[ev.origem]}
                  </p>
                  <p className="text-sm font-medium text-slate-900">{ev.titulo}</p>
                  {ev.detalhe && <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-600">{ev.detalhe}</p>}
                  {nota?.acoes?.length ? (
                    <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">
                      {nota.acoes.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    {ev.documentoId ? (
                      <a href={`/api/processos/${processo.id}/documentos/${ev.documentoId}#page=${ev.pagina}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                        <FileText className="h-3.5 w-3.5" aria-hidden /> {ev.fonte}
                      </a>
                    ) : (
                      ev.fonte && <span>{ev.fonte}</span>
                    )}
                    {nota && (
                      <>
                        {nota.visivelAoCliente && <Badge className="bg-emerald-50 text-emerald-700">No portal do cliente</Badge>}
                        <button type="button" className="hover:text-slate-800" onClick={() => setAberta(expandida ? undefined : ev.id)}>
                          {expandida ? "Esconder texto" : "Ver texto completo"}
                        </button>
                        <button type="button" className="inline-flex items-center gap-1 hover:text-slate-800" onClick={() => void alternarVisivel(nota)}>
                          {nota.visivelAoCliente ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
                          {nota.visivelAoCliente ? "Tirar do portal" : "Mostrar no portal"}
                        </button>
                        <button type="button" className="inline-flex items-center gap-1 text-red-600 hover:text-red-700" onClick={() => setExcluir(nota)}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Excluir
                        </button>
                      </>
                    )}
                  </div>
                  {nota && expandida && <p className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{nota.texto}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {dados?.fatos && (
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Fatos dos PDFs lidos por IA em {quando(dados.fatos.criadoEm)} ({dados.fatos.autorNome}). Confira cada um no PDF pelo link da página.
        </p>
      )}
      <NovaNota processoId={processo.id} aberto={nova} onFechar={() => setNova(false)} onSalva={() => void recarregar()} iaLigada={!!dados?.disponivel} />
      <ConfirmDialog
        open={!!excluir}
        onClose={() => setExcluir(undefined)}
        title="Excluir da linha do tempo?"
        description={
          <>
            <strong>{excluir?.titulo}</strong> será apagado.
          </>
        }
        onConfirm={async () => {
          if (!excluir) return;
          try {
            await api(`/api/processos/${processo.id}/notas/${excluir.id}`, { method: "DELETE" });
            toast("Excluído");
          } catch (e) {
            toast(mensagemDe(e), { tom: "error" });
          }
          void recarregar();
        }}
      />
    </Card>
  );
}
