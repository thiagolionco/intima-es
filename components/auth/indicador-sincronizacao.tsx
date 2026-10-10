"use client";

import clsx from "clsx";
import { CheckCircle2, CloudOff, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";

/** Mostra se as alterações já foram gravadas no servidor. */
export function IndicadorSincronizacao({ escuro }: { escuro?: boolean }) {
  const { sincronizacao, ultimaGravacao } = useStore();
  const hora = ultimaGravacao?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const config = {
    carregando: { icone: Loader2, texto: "Carregando…", cor: "text-slate-400", girar: true },
    pendente: { icone: Loader2, texto: "Alterações pendentes", cor: "text-amber-400", girar: true },
    salvando: { icone: Loader2, texto: "Salvando…", cor: escuro ? "text-slate-300" : "text-slate-500", girar: true },
    salvo: { icone: CheckCircle2, texto: hora ? `Salvo às ${hora}` : "Tudo salvo na sua conta", cor: escuro ? "text-emerald-400" : "text-emerald-600", girar: false },
    erro: { icone: CloudOff, texto: "Falha ao salvar", cor: "text-red-400", girar: false },
  }[sincronizacao];
  const Icone = config.icone;
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-[11px]", config.cor)} role="status" aria-live="polite">
      <Icone className={clsx("h-3.5 w-3.5", config.girar && "animate-spin")} aria-hidden />
      {config.texto}
    </span>
  );
}
