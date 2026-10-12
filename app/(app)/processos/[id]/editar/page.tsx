"use client";

import { useParams, useRouter } from "next/navigation";
import { ProcessoForm } from "@/components/processo-form";
import { useToast } from "@/components/toast";
import { PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/auth/api";
import type { Processo } from "@/lib/processos";
import { useProcesso } from "@/lib/use-processos";
import { useStore } from "@/lib/store";
import { ProcessoNaoEncontrado } from "@/components/processos";

export default function EditarProcessoPage() {
  const { id } = useParams<{ id: string }>();
  const { ready } = useStore();
  const { processo, erro, carregando } = useProcesso(id);
  const { toast } = useToast();
  const router = useRouter();

  if (!ready || carregando) return <Spinner />;
  if (!processo) return <ProcessoNaoEncontrado mensagem={erro} />;

  return (
    <>
      <PageHeader title="Editar processo" />
      <ProcessoForm
        processo={processo}
        onCancelar={() => router.back()}
        onSalvar={async (dados) => {
          await api<{ processo: Processo }>(`/api/processos/${id}`, { method: "PUT", body: dados });
          toast("Processo atualizado");
          router.push(`/processos/${id}`);
        }}
      />
    </>
  );
}
