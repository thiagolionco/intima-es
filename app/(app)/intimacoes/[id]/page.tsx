"use client";

import { ArrowLeft, Copy, ExternalLink, FileX, Pencil, Scale, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PrazoTag } from "@/components/intimacao-card";
import { MemoriaPrazo, usePrazoCalculado } from "@/components/prazo";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, Select, Spinner, StatusBadge, Textarea } from "@/components/ui";
import { useStore } from "@/lib/store";
import type { StatusIntimacao } from "@/lib/types";
import { formatDate, formatDateTime, meioLabel, poloLabel, STATUS_LABEL, STATUS_ORDER, textoPlano } from "@/lib/utils";

function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{rotulo}</dt>
      <dd className="mt-1 text-sm text-slate-800">{children || "—"}</dd>
    </div>
  );
}

export default function DetalheIntimacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { ready, intimacoes, atualizarIntimacao, excluirIntimacao } = useStore();
  const { toast } = useToast();
  const [confirmar, setConfirmar] = useState(false);
  const i = intimacoes.find((x) => x.id === id);
  const [obs, setObs] = useState("");

  useEffect(() => setObs(i?.observacoes ?? ""), [i?.observacoes]);
  const calculo = usePrazoCalculado(i ?? { tribunal: "", dataDisponibilizacao: "" }, i?.regraPrazo);

  if (!ready) return <Spinner />;
  if (!i) {
    return (
      <Card>
        <EmptyState
          icon={<FileX className="h-6 w-6" />}
          title="Intimação não encontrada"
          description="Ela pode ter sido excluída."
          action={
            <Link href="/intimacoes">
              <Button variant="secondary">Voltar à lista</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const texto = textoPlano(i.texto);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      toast("Texto copiado");
    } catch {
      toast("Não foi possível copiar", { tom: "error" });
    }
  }

  return (
    <>
      <Link href="/intimacoes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Intimações
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={i.status} />
            <Badge>{i.tipoComunicacao}</Badge>
            {i.tribunal && <Badge className="bg-brand-50 text-brand-700">{i.tribunal}</Badge>}
            <PrazoTag prazo={i.prazo} status={i.status} />
          </div>
          <h1 className="mt-2 break-all font-mono text-xl font-semibold text-slate-900 sm:text-2xl">{i.numeroProcesso}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {i.cliente} · disponibilizada em {formatDate(i.dataDisponibilizacao)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={i.status}
            onChange={(e) => {
              atualizarIntimacao(i.id, { status: e.target.value as StatusIntimacao });
              toast(`Status alterado para "${STATUS_LABEL[e.target.value as StatusIntimacao]}"`);
            }}
            className="w-auto"
            aria-label="Status"
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Link href={`/intimacoes/${i.id}/editar`}>
            <Button variant="secondary" icon={<Pencil className="h-4 w-4" />}>
              Editar
            </Button>
          </Link>
          <Button variant="secondary" className="text-red-600 hover:bg-red-50" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmar(true)}>
            Excluir
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Dados da comunicação" />
            <dl className="grid gap-5 p-5 sm:grid-cols-2">
              <Item rotulo="Órgão">{i.orgao}</Item>
              <Item rotulo="Data de disponibilização">{formatDate(i.dataDisponibilizacao)}</Item>
              <Item rotulo="Tipo de comunicação">{i.tipoComunicacao}</Item>
              <Item rotulo="Meio">{meioLabel(i.meio)}</Item>
              <Item rotulo="Tipo de documento">{i.tipoDocumento}</Item>
              <Item rotulo="Classe (tipo de ação)">{i.classe}</Item>
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Inteiro teor"
              action={
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" icon={<Copy className="h-4 w-4" />} onClick={copiar}>
                    Copiar
                  </Button>
                  {i.link && (
                    <a href={i.link} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost" icon={<ExternalLink className="h-4 w-4" />}>
                        Documento
                      </Button>
                    </a>
                  )}
                </div>
              }
            />
            <div className="whitespace-pre-wrap break-words p-5 text-sm leading-relaxed text-slate-700">{texto}</div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Partes" subtitle={`${i.partes.length} parte(s)`} />
            <ul className="divide-y divide-slate-100">
              {i.partes.map((p, k) => (
                <li key={k} className="flex items-start gap-3 px-5 py-3">
                  <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{p.nome}</p>
                    <p className="text-xs text-slate-500">{poloLabel(p.polo)}</p>
                  </div>
                </li>
              ))}
              {!i.partes.length && <li className="px-5 py-4 text-sm text-slate-500">Nenhuma parte informada.</li>}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Advogados" subtitle={`${i.advogados.length} advogado(s)`} />
            <ul className="divide-y divide-slate-100">
              {i.advogados.map((a, k) => (
                <li key={k} className="flex items-start gap-3 px-5 py-3">
                  <Scale className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{a.nome}</p>
                    {a.oab && (
                      <p className="text-xs text-slate-500">
                        OAB {a.oab}
                        {a.uf && `/${a.uf}`}
                      </p>
                    )}
                  </div>
                </li>
              ))}
              {!i.advogados.length && <li className="px-5 py-4 text-sm text-slate-500">Nenhum advogado informado.</li>}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Controle interno" />
            <div className="space-y-4 p-5">
              {i.regraPrazo && calculo && (
                <div>
                  <MemoriaPrazo r={calculo} regra={i.regraPrazo} />
                  {i.regraPrazo.fonte === "texto" && (
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-xs text-amber-800">
                      <p className="w-full">Os dias foram lidos no texto (“{i.regraPrazo.trecho}”) e ainda não foram conferidos.</p>
                      <Link href={`/intimacoes/${i.id}/editar`}>
                        <Button size="sm" variant="ghost">
                          Ajustar
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          atualizarIntimacao(i.id, { regraPrazo: { ...i.regraPrazo!, fonte: "usuario" } });
                          toast("Prazo conferido");
                        }}
                      >
                        Está certo
                      </Button>
                    </div>
                  )}
                </div>
              )}
              <dl className="grid grid-cols-2 gap-4">
                <Item rotulo="Prazo">{formatDate(i.prazo)}</Item>
                <Item rotulo="Origem">{i.origem === "comunica" ? "Comunica PJe" : "Manual"}</Item>
                <Item rotulo="Criada em">{formatDateTime(i.createdAt)}</Item>
                <Item rotulo="Atualizada em">{formatDateTime(i.updatedAt)}</Item>
              </dl>
              <div>
                <label htmlFor="obs" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  Observações
                </label>
                <Textarea id="obs" rows={4} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Anotações do escritório…" />
                {obs !== (i.observacoes ?? "") && (
                  <div className="mt-2 flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setObs(i.observacoes ?? "")}>
                      Descartar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        atualizarIntimacao(i.id, { observacoes: obs.trim() || undefined });
                        toast("Observações salvas");
                      }}
                    >
                      Salvar
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmar}
        onClose={() => setConfirmar(false)}
        title="Excluir intimação?"
        description={
          <>
            A intimação do processo <strong className="font-mono">{i.numeroProcesso}</strong> será removida. Esta ação não pode ser desfeita.
          </>
        }
        onConfirm={() => {
          router.push("/intimacoes");
          excluirIntimacao(i.id);
          toast("Intimação excluída");
        }}
      />
    </>
  );
}
