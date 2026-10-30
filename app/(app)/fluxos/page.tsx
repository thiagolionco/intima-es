"use client";

import { CheckCircle2, Loader2, Pencil, Play, Plus, Trash2, Workflow } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog, Modal } from "@/components/modal";
import { SeletorProcessos } from "@/components/seletor-processos";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, PageHeader, Spinner, Textarea } from "@/components/ui";
import { api } from "@/lib/auth/api";
import { useUsuario } from "@/lib/auth/sessao";
import { exigeProcessos, type ExecucaoFluxo, FERRAMENTA_FLUXO_LABEL, type FluxoIa, LIMITES_FLUXO_IA } from "@/lib/fluxos-ia";
import { mensagemDe, useApi } from "@/lib/use-api";
import { useProcessos } from "@/lib/use-processos";
import { formatDateTime } from "@/lib/utils";

/** Escolher os processos e o contexto e mandar rodar. */
function RodarFluxo({ fluxo, onFechar }: { fluxo?: FluxoIa; onFechar: () => void }) {
  const router = useRouter();
  const { processos } = useProcessos();
  const [marcados, setMarcados] = useState<string[]>([]);
  const [contexto, setContexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [visto, setVisto] = useState<FluxoIa>();
  if (fluxo !== visto) {
    setVisto(fluxo);
    setMarcados([]);
    setContexto("");
    setErro(undefined);
  }
  const precisa = fluxo ? exigeProcessos(fluxo.passos) : false;

  async function rodar() {
    if (!fluxo) return;
    setEnviando(true);
    setErro(undefined);
    try {
      const r = await api<{ execucao: ExecucaoFluxo }>(`/api/fluxos-ia/${fluxo.id}/executar`, { body: { processos: marcados, contexto } });
      router.push(`/fluxos/execucoes/${r.execucao.id}`);
    } catch (e) {
      setErro(mensagemDe(e));
      setEnviando(false);
    }
  }

  return (
    <Modal
      open={!!fluxo}
      onClose={() => !enviando && onFechar()}
      title={fluxo ? `Usar o fluxo · ${fluxo.titulo}` : ""}
      footer={
        <>
          <Button variant="secondary" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button icon={<Play className="h-4 w-4" />} loading={enviando} disabled={precisa && !marcados.length} onClick={() => void rodar()}>
            Rodar o fluxo
          </Button>
        </>
      }
    >
      <div className="-mx-5 max-h-[70vh] space-y-4 overflow-y-auto px-5">
        {erro && <Alert>{erro}</Alert>}
        {fluxo && (
          <ol className="space-y-1 text-sm text-slate-600">
            {fluxo.passos.map((p, i) => (
              <li key={p.id}>
                {i + 1}. {FERRAMENTA_FLUXO_LABEL[p.ferramenta]}
                {p.instrucao ? <span className="text-slate-400"> · {p.instrucao.slice(0, 90)}{p.instrucao.length > 90 ? "…" : ""}</span> : null}
              </li>
            ))}
          </ol>
        )}
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">
            Processos{precisa ? <span className="ml-0.5 text-red-500">*</span> : <span className="font-normal text-slate-500"> (opcional)</span>}
          </legend>
          <p className="mb-2 text-xs text-slate-500">
            Com um processo, a IA lê os PDFs dele em cada pedido. Com vários, os PDFs de cada um são lidos pela revisão em tabela.
          </p>
          {processos ? <SeletorProcessos processos={processos} marcados={marcados} onMudar={setMarcados} maximo={LIMITES_FLUXO_IA.processos} id="rodar-processos" /> : <Spinner />}
        </fieldset>
        <Field label="Contexto adicional" htmlFor="rodar-contexto" hint="Opcional. Ex.: o cliente quer acordo; foco em prescrição.">
          <Textarea id="rodar-contexto" rows={3} value={contexto} maxLength={LIMITES_FLUXO_IA.contexto} onChange={(e) => setContexto(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function EstadoExecucao({ e }: { e: ExecucaoFluxo }) {
  if (e.estado === "concluida") {
    const erros = e.resultados.filter((r) => r.estado === "erro").length;
    return (
      <Badge className={erros ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}>
        <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden /> Concluído
      </Badge>
    );
  }
  const feitos = e.resultados.filter((r) => r.estado === "feito" || r.estado === "pulado").length;
  const comErro = e.resultados.some((r) => r.estado === "erro");
  return (
    <Badge className={comErro ? "bg-red-50 text-red-700" : undefined}>
      {comErro ? "Parou com erro" : (
        <>
          <Loader2 className="mr-1 h-3 w-3" aria-hidden /> {feitos} de {e.resultados.length} passos
        </>
      )}
    </Badge>
  );
}

export default function FluxosPage() {
  const { toast } = useToast();
  const usuario = useUsuario();
  const { dados, erro, recarregar } = useApi<{ fluxos: FluxoIa[]; execucoes: ExecucaoFluxo[]; disponivel: boolean }>("/api/fluxos-ia");
  const [rodar, setRodar] = useState<FluxoIa>();
  const [excluir, setExcluir] = useState<FluxoIa>();
  const [excluirExecucao, setExcluirExecucao] = useState<ExecucaoFluxo>();

  return (
    <>
      <PageHeader
        title="Fluxos de IA"
        description="Monte uma vez a sequência de passos (pedido à IA, revisão em tabela, pesquisa, Biblioteca, citações, tradução) e rode com um clique em um ou vários processos. A IA prepara; quem decide e envia é sempre o escritório."
        actions={
          <Link href="/fluxos/novo">
            <Button className="whitespace-nowrap" icon={<Plus className="h-4 w-4" />}>
              Novo fluxo
            </Button>
          </Link>
        }
      />

      {dados && !dados.disponivel && (
        <div className="mb-4">
          <Alert tone="info">A IA não está ligada neste servidor: dá para montar os fluxos, mas eles só rodam depois que a chave da IA for configurada.</Alert>
        </div>
      )}

      {erro ? (
        <Alert>{erro}</Alert>
      ) : !dados ? (
        <Spinner />
      ) : (
        <>
          {!dados.fluxos.length ? (
            <Card>
              <EmptyState
                icon={<Workflow className="h-6 w-6" />}
                title="Nenhum fluxo ainda"
                description="Exemplo: uma tabela com as mesmas perguntas para 50 processos e, em seguida, um resumo dos pontos de alerta. Comece de um modelo pronto e ajuste ao jeito do escritório."
                action={
                  <Link href="/fluxos/novo">
                    <Button icon={<Plus className="h-4 w-4" />}>Montar o primeiro fluxo</Button>
                  </Link>
                }
              />
            </Card>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {dados.fluxos.map((f) => (
                <li key={f.id}>
                  <Card className="flex h-full flex-col">
                    <div className="flex-1 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-slate-900">{f.titulo}</p>
                        {!f.publicado && <Badge className="bg-amber-50 text-amber-700">Rascunho</Badge>}
                      </div>
                      {f.instrucoes && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{f.instrucoes}</p>}
                      <p className="mt-2 text-xs text-slate-500">{f.passos.map((p) => FERRAMENTA_FLUXO_LABEL[p.ferramenta]).join(" → ")}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {f.etiquetas.map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                        <span className="text-xs text-slate-400">{f.autorNome}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-2">
                      <div className="flex gap-1">
                        <Link href={`/fluxos/${f.id}`} aria-label={`Editar ${f.titulo}`}>
                          <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />}>
                            Editar
                          </Button>
                        </Link>
                        <Button size="sm" variant="ghost" className="text-red-600" aria-label={`Excluir ${f.titulo}`} icon={<Trash2 className="h-4 w-4" />} onClick={() => setExcluir(f)} />
                      </div>
                      <Button size="sm" icon={<Play className="h-4 w-4" />} disabled={!dados.disponivel} onClick={() => setRodar(f)}>
                        Usar
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          {dados.execucoes.length > 0 && (
            <Card className="mt-6">
              <CardHeader title="Suas execuções" subtitle={`Só você vê. Ficam as ${LIMITES_FLUXO_IA.execucoesPorConta} mais recentes.`} />
              <ul className="divide-y divide-slate-100">
                {dados.execucoes.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <Link href={`/fluxos/execucoes/${e.id}`} className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 hover:text-brand-700">{e.fluxoTitulo}</p>
                      <p className="truncate text-xs text-slate-500">
                        {formatDateTime(e.criadoEm)}
                        {e.processos.length ? ` · ${e.processos.length === 1 ? e.processos[0].rotulo : `${e.processos.length} processos`}` : ""}
                      </p>
                    </Link>
                    <EstadoExecucao e={e} />
                    <Button size="sm" variant="ghost" className="text-red-600" aria-label={`Excluir a execução de ${formatDateTime(e.criadoEm)}`} icon={<Trash2 className="h-4 w-4" />} onClick={() => setExcluirExecucao(e)} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <RodarFluxo fluxo={rodar} onFechar={() => setRodar(undefined)} />
      <ConfirmDialog
        open={!!excluir}
        onClose={() => setExcluir(undefined)}
        title="Excluir fluxo?"
        description={
          <>
            O fluxo <strong>{excluir?.titulo}</strong> deixa de aparecer {excluir?.publicado ? "para o escritório" : ""}. As execuções já feitas e as tabelas criadas continuam.
            {excluir && excluir.autorId !== usuario.id ? ` Ele foi criado por ${excluir.autorNome}.` : ""}
          </>
        }
        onConfirm={async () => {
          if (!excluir) return;
          try {
            await api(`/api/fluxos-ia/${excluir.id}`, { method: "DELETE" });
            toast("Fluxo excluído");
          } catch (e) {
            toast(mensagemDe(e), { tom: "error" });
          }
          void recarregar();
        }}
      />
      <ConfirmDialog
        open={!!excluirExecucao}
        onClose={() => setExcluirExecucao(undefined)}
        title="Excluir execução?"
        description="Os textos desta execução serão apagados. A tabela criada por ela continua em Processos > Revisão em tabela."
        onConfirm={async () => {
          if (!excluirExecucao) return;
          try {
            await api(`/api/fluxos-ia/execucoes/${excluirExecucao.id}`, { method: "DELETE" });
          } catch (e) {
            toast(mensagemDe(e), { tom: "error" });
          }
          void recarregar();
        }}
      />
    </>
  );
}
