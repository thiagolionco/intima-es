"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ConstrutorFluxo } from "@/components/construtor-fluxo";
import { Alert, PageHeader, Spinner } from "@/components/ui";
import type { FluxoIa } from "@/lib/fluxos-ia";
import { useApi } from "@/lib/use-api";

export default function EditarFluxoPage() {
  const { fluxoId } = useParams<{ fluxoId: string }>();
  const { dados, erro } = useApi<{ fluxo: FluxoIa }>(`/api/fluxos-ia/${fluxoId}`);
  return (
    <>
      <Link href="/fluxos" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Fluxos de IA
      </Link>
      <PageHeader title={dados ? `Editar · ${dados.fluxo.titulo}` : "Editar fluxo"} description="As execuções já feitas guardam os passos como estavam; as próximas usam esta versão." />
      {erro ? <Alert>{erro}</Alert> : !dados ? <Spinner /> : <ConstrutorFluxo key={dados.fluxo.id} fluxo={dados.fluxo} />}
    </>
  );
}
