"use client";

import clsx from "clsx";
import { ChevronsUpDown, KeyRound, LogOut, MonitorSmartphone, ShieldCheck, ShieldAlert, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSessao, useUsuario } from "@/lib/auth/sessao";

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ nome, tamanho = "md" }: { nome: string; tamanho?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 font-semibold text-white ring-2 ring-white/10",
        tamanho === "sm" && "h-7 w-7 text-[11px]",
        tamanho === "md" && "h-9 w-9 text-xs",
        tamanho === "lg" && "h-16 w-16 text-xl",
      )}
      aria-hidden
    >
      {iniciais(nome)}
    </span>
  );
}

/** Menu da conta na barra lateral: identidade, atalhos de segurança e saída. */
export function MenuUsuario({ compacto }: { compacto?: boolean }) {
  const usuario = useUsuario();
  const { sair } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const itens = [
    { href: "/conta", label: "Perfil", icon: UserRound },
    { href: "/conta?aba=seguranca", label: "Senha e verificação", icon: KeyRound },
    { href: "/conta?aba=sessoes", label: "Dispositivos conectados", icon: MonitorSmartphone },
  ];

  return (
    <div ref={raiz} className="relative">
      <button
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        className={clsx("flex w-full items-center gap-3 rounded-xl text-left transition hover:bg-white/5", compacto ? "p-1" : "px-3 py-2.5")}
      >
        <Avatar nome={usuario.nome} />
        {!compacto && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{usuario.nome}</span>
              <span className="block truncate text-[11px] text-slate-400">{usuario.escritorio || usuario.email}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 text-slate-500" aria-hidden />
          </>
        )}
      </button>

      {aberto && (
        <div
          role="menu"
          className={clsx(
            "absolute z-50 w-64 animate-slide-in overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xl",
            compacto ? "right-0 top-12" : "bottom-full left-0 mb-2",
          )}
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{usuario.nome}</p>
            <p className="truncate text-xs text-slate-500">{usuario.email}</p>
            <p className={clsx("mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", usuario.doisFatoresAtivo ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
              {usuario.doisFatoresAtivo ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
              {usuario.doisFatoresAtivo ? "Verificação em duas etapas ativa" : "Proteja com duas etapas"}
            </p>
          </div>
          <div className="py-1">
            {itens.map(({ href, label, icon: Icone }) => (
              <Link key={href} href={href} role="menuitem" onClick={() => setAberto(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-slate-50">
                <Icone className="h-4 w-4 text-slate-400" aria-hidden />
                {label}
              </Link>
            ))}
          </div>
          <div className="border-t border-slate-100 py-1">
            <button
              role="menuitem"
              disabled={saindo}
              onClick={async () => {
                setSaindo(true);
                await sair();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              {saindo ? "Saindo…" : "Sair"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
