"use client";

import clsx from "clsx";
import { Database, FileSearch, History, LayoutDashboard, ListChecks, Menu, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { IndicadorSincronizacao } from "@/components/auth/indicador-sincronizacao";
import { MenuUsuario } from "@/components/auth/menu-usuario";
import { ClepsaSimbolo } from "@/components/marca/clepsa-simbolo";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";
import { useStore } from "@/lib/store";

const NAV = [
  { href: "/", label: "Painel", icon: LayoutDashboard },
  { href: "/intimacoes", label: "Intimações", icon: ListChecks },
  { href: "/comunica", label: "Buscar no Comunica", icon: FileSearch },
  { href: "/clientes", label: "Clientes monitorados", icon: Users },
  { href: "/dados", label: "Dados e backup", icon: Database },
];

function ativo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Navegacao({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { intimacoes, ready } = useStore();
  const novas = intimacoes.filter((i) => i.status === "nova").length;

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV.map(({ href, label, icon: Icone }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          className={clsx(
            "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
            ativo(pathname, href) ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
          )}
        >
          <Icone className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{label}</span>
          {href === "/intimacoes" && ready && novas > 0 && (
            <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">{novas}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

function Marca() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-6">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0b1736] ring-1 ring-inset ring-white/10">
        <ClepsaSimbolo className="h-6 w-6" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-white">Clepsa</span>
        <span className="block text-[11px] text-slate-400">Comunica PJe</span>
      </span>
    </Link>
  );
}

/** Oferece trazer para a conta os dados que a Versão 1 guardava só no navegador. */
function AvisoDadosLegados() {
  const { dadosLegados, importarDadosLegados, descartarDadosLegados } = useStore();
  const { toast } = useToast();
  if (!dadosLegados) return null;
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 sm:flex-row sm:items-center">
      <History className="hidden h-5 w-5 shrink-0 text-brand-600 sm:block" aria-hidden />
      <p className="flex-1">
        Encontramos <strong>{dadosLegados.intimacoes} intimação(ões)</strong> e <strong>{dadosLegados.termos} cliente(s)</strong> salvos neste navegador pela versão anterior.
        Deseja trazê-los para a sua conta?
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={descartarDadosLegados}>
          Descartar
        </Button>
        <Button
          size="sm"
          onClick={() => {
            const r = importarDadosLegados();
            toast("Dados importados para a sua conta", { descricao: `${r.intimacoes} intimação(ões) e ${r.termos} cliente(s).` });
          }}
        >
          Importar para minha conta
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuAberto, setMenuAberto] = useState(false);
  const pathname = usePathname();
  const { erroPersistencia } = useStore();

  useEffect(() => setMenuAberto(false), [pathname]);

  return (
    <div className="min-h-screen">
      {/* Barra lateral (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 bg-slate-900 py-5 lg:flex">
        <Marca />
        <Navegacao />
        <div className="space-y-2 px-3">
          <div className="px-3">
            <IndicadorSincronizacao escuro />
          </div>
          <div className="border-t border-white/10 pt-2">
            <MenuUsuario />
          </div>
        </div>
      </aside>

      {/* Barra superior (mobile) */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-slate-900 px-4 py-3 lg:hidden">
        <Marca />
        <div className="flex items-center gap-1">
          <MenuUsuario compacto />
          <button onClick={() => setMenuAberto(true)} className="rounded-md p-2 text-slate-300 hover:bg-white/10" aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMenuAberto(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-72 animate-slide-in flex-col gap-6 bg-slate-900 py-5">
            <div className="flex items-center justify-between pr-4">
              <Marca />
              <button onClick={() => setMenuAberto(false)} className="rounded-md p-2 text-slate-300 hover:bg-white/10" aria-label="Fechar menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Navegacao onNavigate={() => setMenuAberto(false)} />
            <div className="px-6">
              <IndicadorSincronizacao escuro />
            </div>
          </div>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {erroPersistencia && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {erroPersistencia}
            </div>
          )}
          <AvisoDadosLegados />
          {children}
        </div>
      </main>
    </div>
  );
}
