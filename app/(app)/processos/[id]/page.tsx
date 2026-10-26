"use client";

import clsx from "clsx";
import { ArrowLeft, Inbox, Pencil, Stamp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AnaliseDoProcesso, CartaoRisco, SeloRisco, useAnalises } from "@/components/analise-processo";
import { DocumentosDoProcesso, useDocumentos } from "@/components/documentos-processo";
import { SeloResponsavel } from "@/components/equipe";
import { IntimacaoCard } from "@/components/intimacao-card";
import { CartaoMovimentacao, MovimentacoesDoProcesso, useMovimentacoes } from "@/components/movimentacoes-processo";
import { ParecerDoProcesso, usePareceres } from "@/components/parecer-processo";
import { ConfirmDialog } from "@/components/modal";
import { ProcessoNaoEncontrado } from "@/components/processos";
import { ModalProtocolo, SeloParticular, SeloPrescricao } from "@/components/quadro-processos";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, Spinner } from "@/components/ui";
import { api } from "@/lib/auth/api";
import { AREA_LABEL, diasParaPrescrever, FASE_LABEL, formatarValor, intimacoesDoProcesso, POLO_CLIENTE_LABEL, referencia, textoPrescricao, TIPO_DEMANDA_LABEL } from "@/lib/processos";
import { useProcesso } from "@/lib/use-processos";
import { useStore } from "@/lib/store";
import { formatDate, formatDateTime, formatProcesso, hojeISO } from "@/lib/utils";

function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{rotulo}</dt>
      <dd className="mt-1 text-sm text-slate-800">{children || "—"}</dd>
    </div>
  );
}

type Aba = "resumo" | "andamentos" | "risco" | "parecer" | "documentos" | "intimacoes";

export default function DetalheProcessoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { ready, intimacoes, atualizarIntimacao, podeExcluir } = useStore();
  const { processo: p, erro, carregando, substituir } = useProcesso(id);
  const { toast } = useToast();
  const [aba, setAba] = useState<Aba>("resumo");
  const [confirmar, setConfirmar] = useState(false);
  const [protocolar, setProtocolar] = useState(false);
  const docs = useDocumentos(id);
  const pareceres = usePareceres(id);
  const analises = useAnalises(id);
  const andamentos = useMovimentacoes(id);

  if (!ready || carregando) return <Spinner />;
  if (!p) return <ProcessoNaoEncontrado mensagem={erro} />;

  const ligadas = intimacoesDoProcesso(intimacoes, p.numero);
  const diasPrescricao = diasParaPrescrever(p.prescricao, hojeISO());
  const parecer = pareceres.pareceres?.[0];
  const abas: { id: Aba; rotulo: string; contagem?: number }[] = [
    { id: "resumo", rotulo: "Resumo" },
    { id: "andamentos", rotulo: "Andamentos", contagem: andamentos.dados?.movimentos.length || undefined },
    { id: "risco", rotulo: "Risco (IA)" },
    { id: "parecer", rotulo: "Parecer" },
    { id: "documentos", rotulo: "Documentos", contagem: docs.documentos?.length },
    { id: "intimacoes", rotulo: "Intimações", contagem: ligadas.length },
  ];

  return (
    <>
      <Link href={p.fase === "protocolado" ? "/processos/protocolados" : "/processos"} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> {p.fase === "protocolado" ? "Protocolados" : "Processos"}
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={p.fase === "protocolado" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}>{FASE_LABEL[p.fase]}</Badge>
            {p.area && <Badge className="bg-brand-50 text-brand-700">{AREA_LABEL[p.area]}</Badge>}
            {p.tribunal && <Badge className="bg-brand-50 text-brand-700">{p.tribunal}</Badge>}
            <Badge>{POLO_CLIENTE_LABEL[p.polo]}</Badge>
            <SeloPrescricao prescricao={p.prescricao} />
            <SeloParticular particular={p.particular} />
            <SeloResponsavel id={p.responsavelId} />
            {analises.analises?.[0] && <SeloRisco nivel={analises.analises[0].nivel} />}
          </div>
          {p.numero ? (
            <>
              <h1 className="mt-2 break-all font-mono text-xl font-semibold text-slate-900 sm:text-2xl">{formatProcesso(p.numero)}</h1>
              <p className="mt-1 text-sm text-slate-500">{referencia(p)}</p>
            </>
          ) : (
            <>
              <h1 className="mt-2 text-xl font-semibold text-slate-900 sm:text-2xl">{referencia(p)}</h1>
              <p className="mt-1 text-sm text-slate-500">Ainda sem número de processo</p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {p.fase !== "protocolado" && (
            <Button icon={<Stamp className="h-4 w-4" />} onClick={() => setProtocolar(true)}>
              Protocolar
            </Button>
          )}
          <Link href={`/processos/${p.id}/editar`}>
            <Button variant="secondary" icon={<Pencil className="h-4 w-4" />}>
              Editar
            </Button>
          </Link>
          {podeExcluir && (
            <Button variant="secondary" className="text-red-600 hover:bg-red-50" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmar(true)}>
              Excluir
            </Button>
          )}
        </div>
      </div>

      <div className="mb-6 border-b border-slate-200" role="tablist" aria-label="Seções do processo">
        <div className="-mb-px flex gap-6 overflow-x-auto">
          {abas.map((a) => (
            <button
              key={a.id}
              role="tab"
              aria-selected={aba === a.id}
              onClick={() => setAba(a.id)}
              className={clsx(
                "whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition",
                aba === a.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
              )}
            >
              {a.rotulo}
              {a.contagem !== undefined && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{a.contagem}</span>}
            </button>
          ))}
        </div>
      </div>

      {aba === "resumo" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader title="Dados do processo" />
              <dl className="grid gap-5 p-5 sm:grid-cols-2">
                <Item rotulo="Cliente">{p.cliente}</Item>
                <Item rotulo="Lado do cliente">{POLO_CLIENTE_LABEL[p.polo]}</Item>
                <Item rotulo="Parte contrária">{p.parteContraria}</Item>
                <Item rotulo="Área de atuação">{p.area && AREA_LABEL[p.area]}</Item>
                <Item rotulo="Tipo">{p.tipo && TIPO_DEMANDA_LABEL[p.tipo]}</Item>
                <Item rotulo="Fase">{FASE_LABEL[p.fase]}</Item>
                <Item rotulo="Data do atendimento">{p.dataAtendimento && formatDate(p.dataAtendimento)}</Item>
                <Item rotulo="Início dos trabalhos">{p.dataInicio && formatDate(p.dataInicio)}</Item>
                <Item rotulo="Prescrição">
                  {p.prescricao && (
                    <>
                      {formatDate(p.prescricao)}
                      {diasPrescricao !== undefined && <span className="ml-1 text-slate-500">({textoPrescricao(diasPrescricao).toLowerCase()})</span>}
                    </>
                  )}
                </Item>
                <Item rotulo="Data do protocolo">{p.dataProtocolo && formatDate(p.dataProtocolo)}</Item>
                <Item rotulo="Tribunal">{p.tribunal}</Item>
                <Item rotulo="Comarca">{p.comarca}</Item>
                <Item rotulo="Vara ou órgão julgador">{p.orgao}</Item>
                <Item rotulo="Classe (tipo de ação)">{p.classe}</Item>
                <Item rotulo="Valor da causa">{formatarValor(p.valorCausa)}</Item>
              </dl>
            </Card>
            <Card>
              <CardHeader
                title="Parecer"
                subtitle={parecer ? `Versão ${parecer.versao} · ${parecer.autorNome} · ${formatDateTime(parecer.criadoEm)}` : undefined}
                action={
                  <Button size="sm" variant="ghost" onClick={() => setAba("parecer")}>
                    {parecer ? "Ver completo" : "Escrever"}
                  </Button>
                }
              />
              {parecer ? (
                <p className="line-clamp-6 whitespace-pre-wrap break-words p-5 text-sm leading-relaxed text-slate-700">{parecer.texto}</p>
              ) : (
                <p className="px-5 py-4 text-sm text-slate-500">{pareceres.pareceres ? "Nenhum parecer ainda." : "Carregando…"}</p>
              )}
            </Card>
            {p.observacoes && (
              <Card>
                <CardHeader title="Observações" />
                <p className="whitespace-pre-wrap break-words p-5 text-sm leading-relaxed text-slate-700">{p.observacoes}</p>
              </Card>
            )}
          </div>
          <div className="space-y-6">
            <CartaoMovimentacao estado={andamentos} onVer={() => setAba("andamentos")} />
            <CartaoRisco estado={analises} temDocumentos={!!docs.documentos?.length} onVer={() => setAba("risco")} />
            <Card>
              <CardHeader title="Última intimação" />
              {ligadas[0] ? (
                <div className="p-3">
                  <IntimacaoCard intimacao={ligadas[0]} compacto />
                </div>
              ) : (
                <p className="px-5 py-4 text-sm text-slate-500">Nenhuma intimação com este número ainda.</p>
              )}
            </Card>
            <Card>
              <dl className="grid grid-cols-2 gap-4 p-5">
                <Item rotulo="Cadastrado em">{formatDateTime(p.criadoEm)}</Item>
                <Item rotulo="Atualizado em">{formatDateTime(p.atualizadoEm)}</Item>
              </dl>
            </Card>
          </div>
        </div>
      )}

      {aba === "andamentos" && <MovimentacoesDoProcesso estado={andamentos} />}

      {aba === "risco" && <AnaliseDoProcesso processoId={p.id} estado={analises} documentos={docs.documentos} />}

      {aba === "parecer" && <ParecerDoProcesso processoId={p.id} estado={pareceres} area={p.area} />}

      {aba === "documentos" && <DocumentosDoProcesso
          processoId={p.id}
          {...docs}
          // Com a IA ligada, PDFs novos já disparam uma análise (uma só para o lote enviado).
          aoEnviar={analises.disponivel ? () => void analises.analisar() : undefined}
        />}

      {aba === "intimacoes" &&
        (ligadas.length ? (
          <div className="space-y-3">
            {ligadas.map((i) => (
              <IntimacaoCard
                key={i.id}
                intimacao={i}
                onStatus={(s) => {
                  atualizarIntimacao(i.id, { status: s });
                  toast("Status alterado");
                }}
              />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              icon={<Inbox className="h-6 w-6" />}
              title="Nenhuma intimação deste processo"
              description="As intimações com o mesmo número CNJ, vindas do Comunica ou cadastradas à mão, aparecem aqui sozinhas."
            />
          </Card>
        ))}

      <ModalProtocolo
        processo={protocolar ? p : undefined}
        onFechar={() => setProtocolar(false)}
        onProtocolado={(novo) => {
          setProtocolar(false);
          substituir(novo);
          toast("Processo protocolado", { descricao: novo.numero && formatProcesso(novo.numero) });
        }}
      />
      <ConfirmDialog
        open={confirmar}
        onClose={() => setConfirmar(false)}
        title="Excluir processo?"
        description={
          <>
            O cadastro do processo <strong className={p.numero ? "font-mono" : undefined}>{p.numero ? formatProcesso(p.numero) : referencia(p)}</strong> os PDFs anexados, o parecer, as análises de risco e os andamentos guardados serão apagados. As intimações continuam na lista de intimações.
          </>
        }
        onConfirm={async () => {
          try {
            await api(`/api/processos/${p.id}`, { method: "DELETE" });
            toast("Processo excluído");
            router.push("/processos");
          } catch (e) {
            toast(e instanceof Error ? e.message : "Não foi possível excluir", { tom: "error" });
          }
        }}
      />
    </>
  );
}
