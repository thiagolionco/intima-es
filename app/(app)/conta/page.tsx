"use client";

import clsx from "clsx";
import { History, KeyRound, MonitorSmartphone, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AbaAtividade } from "@/components/conta/atividade";
import { AbaPerfil } from "@/components/conta/perfil";
import { AbaPrivacidade } from "@/components/conta/privacidade";
import { AbaSeguranca } from "@/components/conta/seguranca";
import { AbaSessoes } from "@/components/conta/sessoes";
import { PageHeader } from "@/components/ui";

const ABAS = [
  { id: "perfil", rotulo: "Perfil", descricao: "Nome, escritório e OAB", icone: UserRound, Componente: AbaPerfil },
  { id: "seguranca", rotulo: "Segurança", descricao: "Senha e duas etapas", icone: KeyRound, Componente: AbaSeguranca },
  { id: "sessoes", rotulo: "Dispositivos", descricao: "Sessões conectadas", icone: MonitorSmartphone, Componente: AbaSessoes },
  { id: "atividade", rotulo: "Atividade", descricao: "Registro de auditoria", icone: History, Componente: AbaAtividade },
  { id: "privacidade", rotulo: "Privacidade e dados", descricao: "Exportar ou excluir (LGPD)", icone: ShieldCheck, Componente: AbaPrivacidade },
] as const;

function CentralDaConta() {
  const param = useSearchParams().get("aba");
  const aba = ABAS.find((a) => a.id === param) ?? ABAS[0];
  const { Componente } = aba;
  return (
    <>
      <PageHeader title="Minha conta" description="Gerencie sua identidade, a segurança do acesso e os seus dados." />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Seções da conta">
          {ABAS.map(({ id, rotulo, descricao, icone: Icone }) => (
            <Link
              key={id}
              href={id === "perfil" ? "/conta" : `/conta?aba=${id}`}
              aria-current={aba.id === id ? "page" : undefined}
              className={clsx(
                "flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 transition",
                aba.id === id ? "bg-white shadow-card ring-1 ring-slate-200" : "text-slate-600 hover:bg-white/60",
              )}
            >
              <Icone className={clsx("h-4 w-4 shrink-0", aba.id === id ? "text-brand-600" : "text-slate-400")} aria-hidden />
              <span>
                <span className="block text-sm font-medium text-slate-900">{rotulo}</span>
                <span className="hidden text-xs text-slate-500 lg:block">{descricao}</span>
              </span>
            </Link>
          ))}
        </nav>
        <div className="min-w-0">
          <Componente />
        </div>
      </div>
    </>
  );
}

export default function PaginaConta() {
  return (
    <Suspense>
      <CentralDaConta />
    </Suspense>
  );
}
