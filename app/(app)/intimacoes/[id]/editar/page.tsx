"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { IntimacaoForm } from "@/components/intimacao-form";
import { useToast } from "@/components/toast";
import { Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { useStore } from "@/lib/store";
import { FileX } from "lucide-react";

export default function EditarIntimacaoPage() {
  const { id } = useParams<{ id: string }>();
  const { ready, intimacoes, atualizarIntimacao } = useStore();
  const { toast } = useToast();
  const router = useRouter();
  const intimacao = intimacoes.find((i) => i.id === id);

  if (!ready) return <Spinner />;
  if (!intimacao) {
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

  return (
    <>
      <PageHeader title="Editar intimação" description={intimacao.numeroProcesso} />
      <IntimacaoForm
        intimacao={intimacao}
        onCancelar={() => router.back()}
        onSalvar={(d) => {
          atualizarIntimacao(intimacao.id, {
            ...d,
            link: d.link.trim() || undefined,
            prazo: d.prazo || undefined,
            regraPrazo: d.regraPrazo ?? undefined,
            observacoes: d.observacoes.trim() || undefined,
          });
          toast("Alterações salvas");
          router.push(`/intimacoes/${intimacao.id}`);
        }}
      />
    </>
  );
}
