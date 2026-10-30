"use client";

import { Plus, Table2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/modal";
import { AbasProcessos } from "@/components/quadro-processos";
import { FormRevisao } from "@/components/revisao-tabela";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/auth/api";
import type { ModeloRevisao, RevisaoTabela } from "@/lib/revisao";
import { mensagemDe, useApi } from "@/lib/use-api";
import { useProcessos } from "@/lib/use-processos";
import { formatDateTime } from "@/lib/utils";

export default function RevisoesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { dados, erro, recarregar } = useApi<{ revisoes: RevisaoTabela[]; modelos: ModeloRevisao[]; disponivel: boolean }>("/api/revisoes");
  const { processos } = useProcessos();
  const [nova, setNova] = useState(false);
  const [excluir, setExcluir] = useState<RevisaoTabela>();
  const [excluirModelo, setExcluirModelo] = useState<ModeloRevisao>();

  return (
    <>
      <PageHeader
        title="Processos"
        description="Faça as mesmas perguntas a vários processos de uma vez. A IA lê os PDFs de cada um e preenche a tabela, sempre mostrando a página de onde tirou cada resposta."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} disabled={!processos?.length} onClick={() => setNova(true)}>
            Nova tabela
          </Button>
        }
      />
      <AbasProcessos atual="revisao" />

      {dados && !dados.disponivel && (
        <div className="mb-4">
          <Alert tone="info">A IA não está configurada: dá para montar a tabela e preencher à mão, mas o preenchimento automático fica desligado.</Alert>
        </div>
      )}

      {erro ? (
        <Alert>{erro}</Alert>
      ) : !dados ? (
        <Spinner />
      ) : !dados.revisoes.length ? (
        <Card>
          <EmptyState
            icon={<Table2 className="h-6 w-6" />}
            title="Nenhuma tabela ainda"
            description="Exemplo: escolha 30 processos de consumidor e pergunte valor da causa, se houve tutela, se há negativação e o risco. Em minutos a carteira inteira fica numa tabela que dá para conferir e baixar."
            action={
              <Button icon={<Plus className="h-4 w-4" />} disabled={!processos?.length} onClick={() => setNova(true)}>
                Montar a primeira tabela
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {dados.revisoes.map((r) => {
            const total = r.linhas.length * r.perguntas.length;
            const prontas = r.linhas.reduce((n, l) => n + Object.values(l.celulas).filter((c) => c.estado === "pronta" || c.estado === "sem_resposta").length, 0);
            return (
              <li key={r.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3 p-4">
                    <Link href={`/processos/revisao/${r.id}`} className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 hover:text-brand-700">{r.titulo}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {r.linhas.length} processo(s) · {r.perguntas.length} pergunta(s) · {r.autorNome} · {formatDateTime(r.atualizadoEm)}
                      </p>
                      <div className="mt-2">
                        <Badge className={prontas === total ? "bg-emerald-50 text-emerald-700" : undefined}>
                          {prontas} de {total} células preenchidas
                        </Badge>
                      </div>
                    </Link>
                    <Button size="sm" variant="ghost" className="text-red-600" aria-label={`Excluir ${r.titulo}`} icon={<Trash2 className="h-4 w-4" />} onClick={() => setExcluir(r)} />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {dados && dados.modelos.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Modelos de perguntas do escritório" subtitle="Salvos a partir de uma tabela. Aparecem em “Usar um modelo” ao criar a próxima." />
          <ul className="divide-y divide-slate-100">
            {dados.modelos.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{m.titulo}</p>
                  <p className="truncate text-xs text-slate-500">{m.perguntas.map((p) => p.texto).join(" · ")}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-red-600" aria-label={`Excluir o modelo ${m.titulo}`} icon={<Trash2 className="h-4 w-4" />} onClick={() => setExcluirModelo(m)} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <FormRevisao aberto={nova} modelos={dados?.modelos ?? []} processos={processos ?? []} onFechar={() => setNova(false)} onSalva={(r) => router.push(`/processos/revisao/${r.id}`)} />
      <ConfirmDialog
        open={!!excluir}
        onClose={() => setExcluir(undefined)}
        title="Excluir tabela?"
        description={<>A tabela <strong>{excluir?.titulo}</strong> e as respostas dela serão apagadas. Os processos não mudam.</>}
        onConfirm={async () => {
          if (!excluir) return;
          try {
            await api(`/api/revisoes/${excluir.id}`, { method: "DELETE" });
            toast("Tabela excluída");
          } catch (e) {
            toast(mensagemDe(e), { tom: "error" });
          }
          void recarregar();
        }}
      />
      <ConfirmDialog
        open={!!excluirModelo}
        onClose={() => setExcluirModelo(undefined)}
        title="Excluir modelo?"
        description={<>O modelo <strong>{excluirModelo?.titulo}</strong> deixa de aparecer. As tabelas feitas com ele continuam.</>}
        onConfirm={async () => {
          if (!excluirModelo) return;
          try {
            await api(`/api/revisoes/modelos/${excluirModelo.id}`, { method: "DELETE" });
          } catch (e) {
            toast(mensagemDe(e), { tom: "error" });
          }
          void recarregar();
        }}
      />
    </>
  );
}
