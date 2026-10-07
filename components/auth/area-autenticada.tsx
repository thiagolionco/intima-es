"use client";

import { Gavel, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { useToast } from "@/components/toast";
import { useSessao } from "@/lib/auth/sessao";
import { StoreProvider } from "@/lib/store";

export function TelaCarregando({ texto = "Abrindo seu espaço de trabalho…" }: { texto?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50" role="status">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg">
        <Gavel className="h-6 w-6" aria-hidden />
      </span>
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {texto}
      </p>
    </div>
  );
}

/**
 * Portão das páginas internas: só renderiza a aplicação com sessão válida e monta a store
 * com o espaço de trabalho do usuário (a chave por id garante que nada vaza entre contas).
 */
export function AreaAutenticada({ children }: { children: ReactNode }) {
  const { estado } = useSessao();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (estado.tipo === "anonimo") {
      const para = window.location.pathname + window.location.search;
      router.replace(para === "/" ? "/entrar" : `/entrar?para=${encodeURIComponent(para)}`);
    }
  }, [estado.tipo, router]);

  const aoConflito = useCallback(
    () => toast("Dados atualizados", { tom: "info", descricao: "Havia alterações mais recentes feitas em outra aba ou dispositivo. Recarregamos a versão atual." }),
    [toast],
  );

  if (estado.tipo !== "autenticado") return <TelaCarregando texto={estado.tipo === "anonimo" ? "Redirecionando para o login…" : undefined} />;

  return (
    <StoreProvider key={estado.usuario.id} onConflito={aoConflito}>
      <AppShell>{children}</AppShell>
    </StoreProvider>
  );
}
