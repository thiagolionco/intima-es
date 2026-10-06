"use client";

import { useRouter } from "next/navigation";
import { IntimacaoForm } from "@/components/intimacao-form";
import { useToast } from "@/components/toast";
import { PageHeader, Spinner } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function NovaIntimacaoPage() {
  const { ready, adicionarIntimacao } = useStore();
  const { toast } = useToast();
  const router = useRouter();

  if (!ready) return <Spinner />;

  return (
    <>
      <PageHeader title="Nova intimação" description="Cadastre manualmente uma intimação que não veio do Comunica PJe." />
      <IntimacaoForm
        onCancelar={() => router.back()}
        onSalvar={(d) => {
          const nova = adicionarIntimacao({
            ...d,
            origem: "manual",
            link: d.link.trim() || undefined,
            prazo: d.prazo || undefined,
            observacoes: d.observacoes.trim() || undefined,
          });
          toast("Intimação cadastrada", { descricao: d.numeroProcesso });
          router.push(`/intimacoes/${nova.id}`);
        }}
      />
    </>
  );
}
