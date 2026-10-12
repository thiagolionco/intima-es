"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ProcessoForm, type ValoresIniciais } from "@/components/processo-form";
import { useToast } from "@/components/toast";
import { PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/auth/api";
import type { Processo } from "@/lib/processos";
import { useStore } from "@/lib/store";
import { formatProcesso } from "@/lib/utils";

const CAMPOS_INICIAIS = ["numero", "cliente", "parteContraria", "polo", "tribunal", "orgao", "classe"] as const;

function NovoProcesso() {
  const { ready } = useStore();
  const { toast } = useToast();
  const router = useRouter();
  const params = useSearchParams();

  if (!ready) return <Spinner />;

  // Vindo de uma intimação, o formulário já chega preenchido com o que ela tem.
  const iniciais: ValoresIniciais = {};
  for (const c of CAMPOS_INICIAIS) {
    const v = params.get(c);
    if (v) (iniciais as Record<string, string>)[c] = v;
  }

  return (
    <>
      <PageHeader title="Cadastrar processo" description="Os dados ficam no escritório e as intimações com o mesmo número aparecem no processo." />
      <ProcessoForm
        iniciais={iniciais}
        onCancelar={() => router.back()}
        onSalvar={async (dados) => {
          const { processo } = await api<{ processo: Processo }>("/api/processos", { body: dados });
          toast("Processo cadastrado", { descricao: formatProcesso(processo.numero) });
          router.push(`/processos/${processo.id}`);
        }}
      />
    </>
  );
}

export default function NovoProcessoPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <NovoProcesso />
    </Suspense>
  );
}
