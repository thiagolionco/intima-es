"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ConstrutorFluxo } from "@/components/construtor-fluxo";
import { PageHeader } from "@/components/ui";

export default function NovoFluxoPage() {
  return (
    <>
      <Link href="/fluxos" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Fluxos de IA
      </Link>
      <PageHeader title="Novo fluxo" description="Dê um nome, escreva as instruções gerais e monte os passos na ordem. Rascunho só você vê; publicado aparece para o escritório." />
      <ConstrutorFluxo />
    </>
  );
}
