"use client";

import clsx from "clsx";
import { ArrowLeft, Inbox, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { DocumentosDoProcesso, useDocumentos } from "@/components/documentos-processo";
import { SeloResponsavel } from "@/components/equipe";
import { IntimacaoCard } from "@/components/intimacao-card";
import { ConfirmDialog } from "@/components/modal";
import { ProcessoNaoEncontrado } from "@/components/processos";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, Spinner } from "@/components/ui";
import { api } from "@/lib/auth/api";
import { formatarValor, intimacoesDoProcesso, POLO_CLIENTE_LABEL } from "@/lib/processos";
import { useProcesso } from "@/lib/use-processos";
import { useStore } from "@/lib/store";
import { formatDateTime, formatProcesso } from "@/lib/utils";

function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{rotulo}</dt>
      <dd className="mt-1 text-sm text-slate-800">{children || "—"}</dd>
    </div>
  );
}

type Aba = "resumo" | "documentos" | "intimacoes";

export default function DetalheProcessoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { ready, intimacoes, atualizarIntimacao } = useStore();
  const { processo: p, erro, carregando } = useProcesso(id);
  const { toast } = useToast();
  const [aba, setAba] = useState<Aba>("resumo");
  const [confirmar, setConfirmar] = useState(false);
  const docs = useDocumentos(id);

  if (!ready || carregando) return <Spinner />;
  if (!p) return <ProcessoNaoEncontrado mensagem={erro} />;

  const ligadas = intimacoesDoProcesso(intimacoes, p.numero);
  const abas: { id: Aba; rotulo: string; contagem?: number }[] = [
    { id: "resumo", rotulo: "Resumo" },
    { id: "documentos", rotulo: "Documentos", contagem: docs.documentos?.length },
    { id: "intimacoes", rotulo: "Intimações", contagem: ligadas.length },
  ];

  return (
    <>
      <Link href="/processos" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Processos
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {p.tribunal && <Badge className="bg-brand-50 text-brand-700">{p.tribunal}</Badge>}
            <Badge>{POLO_CLIENTE_LABEL[p.polo]}</Badge>
            <SeloResponsavel id={p.responsavelId} />
          </div>
          <h1 className="mt-2 break-all font-mono text-xl font-semibold text-slate-900 sm:text-2xl">{formatProcesso(p.numero)}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {p.cliente}
            {p.parteContraria && ` × ${p.parteContraria}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/processos/${p.id}/editar`}>
            <Button variant="secondary" icon={<Pencil className="h-4 w-4" />}>
              Editar
            </Button>
          </Link>
          <Button variant="secondary" className="text-red-600 hover:bg-red-50" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmar(true)}>
            Excluir
          </Button>
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
                <Item rotulo="Tribunal">{p.tribunal}</Item>
                <Item rotulo="Vara ou órgão julgador">{p.orgao}</Item>
                <Item rotulo="Classe (tipo de ação)">{p.classe}</Item>
                <Item rotulo="Valor da causa">{formatarValor(p.valorCausa)}</Item>
              </dl>
            </Card>
            {p.observacoes && (
              <Card>
                <CardHeader title="Observações" />
                <p className="whitespace-pre-wrap break-words p-5 text-sm leading-relaxed text-slate-700">{p.observacoes}</p>
              </Card>
            )}
          </div>
          <div className="space-y-6">
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

      {aba === "documentos" && <DocumentosDoProcesso processoId={p.id} {...docs} />}

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

      <ConfirmDialog
        open={confirmar}
        onClose={() => setConfirmar(false)}
        title="Excluir processo?"
        description={
          <>
            O cadastro do processo <strong className="font-mono">{formatProcesso(p.numero)}</strong> e os PDFs anexados a ele serão apagados. As intimações continuam na lista de intimações.
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
