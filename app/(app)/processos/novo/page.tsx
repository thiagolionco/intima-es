"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ProcessoForm, type ValoresIniciais } from "@/components/processo-form";
import { useToast } from "@/components/toast";
import { PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/auth/api";
import { FASES, type Processo, referencia } from "@/lib/processos";
import { useStore } from "@/lib/store";
import { formatProcesso } from "@/lib/utils";

const CAMPOS_INICIAIS = ["numero", "cliente", "parteContraria", "polo", "tribunal", "orgao", "classe", "comarca"] as const;

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
  const fase = FASES.find((f) => f.id === params.get("fase"));
  if (fase) iniciais.fase = fase.id;
  const protocolado = (iniciais.fase ?? (iniciais.numero ? "protocolado" : "triagem")) === "protocolado";

  return (
    <>
      <PageHeader
        title={protocolado ? "Cadastrar processo" : "Novo caso"}
        description={protocolado ? "Os dados ficam no escritório e as intimações com o mesmo número aparecem no processo." : "O caso entra no quadro de processos; o número do processo pode vir depois, no protocolo."}
      />
      <ProcessoForm
        iniciais={iniciais}
        onCancelar={() => router.back()}
        onSalvar={async (dados) => {
          const { processo } = await api<{ processo: Processo }>("/api/processos", { body: dados });
          toast(processo.numero ? "Processo cadastrado" : "Caso cadastrado", { descricao: processo.numero ? formatProcesso(processo.numero) : referencia(processo) });
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
