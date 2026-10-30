"use client";

import clsx from "clsx";
import { ArrowLeft, BadgeCheck, Download, FileText, Lock, MessageSquare, Pencil, Play, RefreshCw, Save, Square } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { FormRevisao } from "@/components/revisao-tabela";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, CardHeader, Field, Input, PageHeader, Spinner, Textarea } from "@/components/ui";
import { api } from "@/lib/auth/api";
import { nomeDeArquivo } from "@/lib/baixar";
import { baixarCSV } from "@/lib/csv";
import { type CelulaRevisao, LIMITES_REVISAO, type LinhaRevisao, type PerguntaRevisao, revisaoEmCsv, type RevisaoTabela } from "@/lib/revisao";
import { mensagemDe, useApi } from "@/lib/use-api";
import { useProcessos } from "@/lib/use-processos";
import { formatDateTime } from "@/lib/utils";

type Aberta = { linha: LinhaRevisao; pergunta: PerguntaRevisao };

/** Linha precisa da IA: nunca rodou, ou tem célula vazia ou com erro que não está travada. */
const precisa = (l: LinhaRevisao, perguntas: PerguntaRevisao[]) =>
  !l.executadaEm || !!l.erro || perguntas.some((p) => {
    const c = l.celulas[p.id];
    return !c || (!c.travada && (c.estado === "pendente" || c.estado === "erro"));
  });

function Celula({ c, onAbrir }: { c?: CelulaRevisao; onAbrir: () => void }) {
  return (
    <button type="button" onClick={onAbrir} className="block w-full min-w-[12rem] max-w-xs text-left">
      {!c || c.estado === "pendente" ? (
        <span className="text-xs text-slate-400">—</span>
      ) : c.estado === "erro" ? (
        <span className="text-xs text-red-600">Erro</span>
      ) : (
        <span className={clsx("line-clamp-3 text-sm", c.estado === "sem_resposta" ? "italic text-slate-400" : "text-slate-800")}>{c.resposta || "Sem resposta nos PDFs"}</span>
      )}
      {c && (c.fonte || c.revisada || c.travada || c.editadaPor) && (
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          {c.fonte && (
            <span className="inline-flex items-center gap-0.5">
              <FileText className="h-3 w-3" aria-hidden /> p. {c.fonte.pagina}
            </span>
          )}
          {c.revisada && <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" aria-label="Conferida" />}
          {c.travada && <Lock className="h-3 w-3" aria-label="Travada" />}
          {c.editadaPor && <Pencil className="h-3 w-3" aria-label="Editada à mão" />}
        </span>
      )}
    </button>
  );
}

function ModalCelula({ revisaoId, aberta, onFechar, onSalva }: { revisaoId: string; aberta?: Aberta; onFechar: () => void; onSalva: (processoId: string, perguntaId: string, c: CelulaRevisao) => void }) {
  const { toast } = useToast();
  const c = aberta ? aberta.linha.celulas[aberta.pergunta.id] : undefined;
  const [resposta, setResposta] = useState("");
  const [revisada, setRevisada] = useState(false);
  const [travada, setTravada] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [vista, setVista] = useState<unknown>();
  if (aberta !== vista) {
    setVista(aberta);
    setResposta(c?.resposta ?? "");
    setRevisada(!!c?.revisada);
    setTravada(!!c?.travada);
  }

  async function salvar() {
    if (!aberta) return;
    setSalvando(true);
    try {
      const corpo: Record<string, unknown> = { processoId: aberta.linha.processoId, perguntaId: aberta.pergunta.id, revisada, travada };
      if (resposta !== (c?.resposta ?? "")) corpo.resposta = resposta;
      const r = await api<{ celula: CelulaRevisao }>(`/api/revisoes/${revisaoId}/celulas`, { body: corpo });
      onSalva(aberta.linha.processoId, aberta.pergunta.id, r.celula);
      onFechar();
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={!!aberta}
      onClose={() => !salvando && onFechar()}
      title={aberta?.pergunta.texto ?? ""}
      footer={
        <>
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button icon={<Save className="h-4 w-4" />} loading={salvando} onClick={() => void salvar()}>
            Salvar
          </Button>
        </>
      }
    >
      {aberta && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">{aberta.linha.rotulo}</p>
          <Field label="Resposta" htmlFor="celula-resposta" hint={c?.editadaPor ? `Editada à mão por ${c.editadaPor}` : undefined}>
            <Textarea id="celula-resposta" rows={3} value={resposta} maxLength={LIMITES_REVISAO.resposta} onChange={(e) => setResposta(e.target.value)} />
          </Field>
          {c?.justificativa && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Por que a IA respondeu assim</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{c.justificativa}</p>
            </div>
          )}
          {c?.fonte && (
            <a
              href={`/api/processos/${aberta.linha.processoId}/documentos/${c.fonte.documentoId}#page=${c.fonte.pagina}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
            >
              <FileText className="h-4 w-4" aria-hidden /> {c.fonte.documentoNome}, página {c.fonte.pagina}
            </a>
          )}
          <div className="space-y-2 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={revisada} onChange={(e) => setRevisada(e.target.checked)} />
              Conferi esta resposta {c?.revisada && <span className="text-xs text-slate-500">({c.revisada.por}, {formatDateTime(c.revisada.em)})</span>}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={travada} onChange={(e) => setTravada(e.target.checked)} />
              Travar: a IA não reescreve ao preencher de novo
            </label>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function RevisaoPage() {
  const { revisaoId } = useParams<{ revisaoId: string }>();
  const { toast } = useToast();
  const { dados, erro, setDados } = useApi<{ revisao: RevisaoTabela }>(`/api/revisoes/${revisaoId}`);
  const iaLigada = useApi<{ disponivel: boolean }>("/api/revisoes").dados?.disponivel;
  const { processos } = useProcessos();
  const [rodando, setRodando] = useState<string>();
  const [progresso, setProgresso] = useState<{ feitas: number; total: number }>();
  const parar = useRef(false);
  const [aberta, setAberta] = useState<Aberta>();
  const [editar, setEditar] = useState(false);
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState<string>();
  const [perguntando, setPerguntando] = useState(false);
  const [salvandoModelo, setSalvandoModelo] = useState(false);

  const r = dados?.revisao;

  const trocarLinha = (linha: LinhaRevisao) => setDados((d) => d && { revisao: { ...d.revisao, linhas: d.revisao.linhas.map((l) => (l.processoId === linha.processoId ? linha : l)) } });

  async function preencher(processoId: string): Promise<boolean> {
    setRodando(processoId);
    try {
      trocarLinha((await api<{ linha: LinhaRevisao }>(`/api/revisoes/${revisaoId}/executar`, { body: { processoId } })).linha);
      return true;
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
      return false;
    } finally {
      setRodando(undefined);
    }
  }

  /** Uma requisição por processo, em sequência, com progresso e botão de parar. */
  async function preencherTodas(soAsQuePrecisam: boolean) {
    if (!r) return;
    const fila = r.linhas.filter((l) => !soAsQuePrecisam || precisa(l, r.perguntas)).map((l) => l.processoId);
    parar.current = false;
    setProgresso({ feitas: 0, total: fila.length });
    for (let i = 0; i < fila.length && !parar.current; i++) {
      await preencher(fila[i]);
      setProgresso({ feitas: i + 1, total: fila.length });
    }
    setProgresso(undefined);
  }

  async function perguntar() {
    setPerguntando(true);
    try {
      setResposta((await api<{ resposta: string }>(`/api/revisoes/${revisaoId}/perguntar`, { body: { pergunta } })).resposta);
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    } finally {
      setPerguntando(false);
    }
  }

  async function salvarModelo() {
    if (!r) return;
    setSalvandoModelo(true);
    try {
      await api("/api/revisoes/modelos", { body: { titulo: r.titulo, perguntas: r.perguntas.map(({ texto, formato }) => ({ texto, formato })) } });
      toast("Perguntas salvas como modelo");
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    } finally {
      setSalvandoModelo(false);
    }
  }

  if (erro) return <Alert>{erro}</Alert>;
  if (!r) return <Spinner />;

  const faltando = r.linhas.filter((l) => precisa(l, r.perguntas)).length;
  const ocupado = !!rodando || !!progresso;

  return (
    <>
      <Link href="/processos/revisao" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Revisão em tabela
      </Link>
      <PageHeader
        title={r.titulo}
        description={`${r.linhas.length} processo(s) · ${r.perguntas.length} pergunta(s) · criada por ${r.autorNome}. Clique numa célula para ver a fonte, corrigir, conferir ou travar.`}
        actions={
          <>
            {iaLigada &&
              (progresso ? (
                <Button
                  variant="secondary"
                  icon={<Square className="h-4 w-4" />}
                  onClick={() => {
                    parar.current = true;
                  }}
                >
                  Parar ({progresso.feitas}/{progresso.total})
                </Button>
              ) : faltando ? (
                <Button icon={<Play className="h-4 w-4" />} disabled={ocupado} onClick={() => void preencherTodas(true)}>
                  Preencher {faltando === r.linhas.length ? "a tabela" : `${faltando} linha(s)`} com a IA
                </Button>
              ) : (
                <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} disabled={ocupado} onClick={() => void preencherTodas(false)}>
                  Preencher tudo de novo
                </Button>
              ))}
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => baixarCSV(revisaoEmCsv(r), `${nomeDeArquivo(r.titulo)}.csv`)}>
              Baixar planilha
            </Button>
            <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} disabled={ocupado} onClick={() => setEditar(true)}>
              Editar
            </Button>
            <Button variant="ghost" loading={salvandoModelo} onClick={() => void salvarModelo()}>
              Salvar perguntas como modelo
            </Button>
          </>
        }
      />

      {progresso && (
        <div className="mb-4">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={progresso.feitas} aria-valuemax={progresso.total} aria-label="Progresso do preenchimento">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${progresso.total ? (progresso.feitas / progresso.total) * 100 : 0}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">A IA lê os PDFs de um processo por vez. Pode sair da página: o que já foi preenchido fica salvo.</p>
        </div>
      )}

      <Card className="mb-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="sticky left-0 z-10 min-w-[14rem] bg-slate-50 px-4 py-3">
                  Processo
                </th>
                {r.perguntas.map((p) => (
                  <th key={p.id} scope="col" className="min-w-[12rem] px-4 py-3 normal-case tracking-normal">
                    {p.texto}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.linhas.map((l) => (
                <tr key={l.processoId} className="align-top">
                  <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-3 font-normal">
                    <Link href={`/processos/${l.processoId}`} className="block text-sm text-slate-900 hover:text-brand-700">
                      {l.rotulo}
                    </Link>
                    <span className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                      {rodando === l.processoId ? "Lendo os PDFs…" : l.executadaEm ? `Preenchida ${formatDateTime(l.executadaEm)}` : "Ainda não preenchida"}
                      {iaLigada && (
                        <button type="button" className="font-medium text-brand-700 hover:underline disabled:opacity-50" disabled={ocupado} onClick={() => void preencher(l.processoId)}>
                          {l.executadaEm ? "De novo" : "Preencher"}
                        </button>
                      )}
                    </span>
                    {l.erro && <span className="mt-1 block text-[11px] text-red-600">{l.erro}</span>}
                  </th>
                  {r.perguntas.map((p) => (
                    <td key={p.id} className="px-4 py-3">
                      <Celula c={l.celulas[p.id]} onAbrir={() => setAberta({ linha: l, pergunta: p })} />
                    </td>
                  ))}
                </tr>
              ))}
              {!r.linhas.length && (
                <tr>
                  <td colSpan={r.perguntas.length + 1} className="px-4 py-6 text-center text-sm text-slate-500">
                    Nenhum dos processos desta tabela está visível para você.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {iaLigada && (
        <Card>
          <CardHeader title="Perguntar à tabela" subtitle="A IA responde olhando só as células preenchidas (ex.: quais processos têm risco alto e tutela deferida?)." />
          <form
            className="space-y-3 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (pergunta.trim()) void perguntar();
            }}
          >
            <div className="flex gap-2">
              <Input value={pergunta} onChange={(e) => setPergunta(e.target.value)} maxLength={500} placeholder="Sua pergunta sobre a carteira" aria-label="Pergunta sobre a tabela" className="min-w-0 flex-1" />
              <Button type="submit" icon={<MessageSquare className="h-4 w-4" />} loading={perguntando} disabled={!pergunta.trim()}>
                Perguntar
              </Button>
            </div>
            {resposta && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">{resposta}</p>}
          </form>
        </Card>
      )}

      <ModalCelula
        revisaoId={revisaoId}
        aberta={aberta}
        onFechar={() => setAberta(undefined)}
        onSalva={(processoId, perguntaId, c) => {
          const l = r.linhas.find((x) => x.processoId === processoId);
          if (l) trocarLinha({ ...l, celulas: { ...l.celulas, [perguntaId]: c } });
        }}
      />
      <FormRevisao aberto={editar} revisao={r} modelos={[]} processos={processos ?? []} onFechar={() => setEditar(false)} onSalva={(nova) => setDados({ revisao: nova })} />
    </>
  );
}
