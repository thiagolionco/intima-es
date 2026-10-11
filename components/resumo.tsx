"use client";

import clsx from "clsx";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/auth/api";
import { useStore } from "@/lib/store";
import type { Intimacao } from "@/lib/types";
import { useToast } from "./toast";
import { Button } from "./ui";

let recursos: Promise<{ resumos: boolean }> | null = null;

/** Se o servidor tem o resumo automático ligado (há chave da Anthropic configurada). */
export function useResumoDisponivel(): boolean {
  const [ligado, setLigado] = useState(false);
  useEffect(() => {
    recursos ??= api<{ resumos: boolean }>("/api/recursos").catch(() => {
      recursos = null;
      return { resumos: false };
    });
    let vivo = true;
    recursos.then((r) => vivo && setLigado(r.resumos));
    return () => {
      vivo = false;
    };
  }, []);
  return ligado;
}

/** As duas linhas do resumo, com a marca de que foram geradas automaticamente. */
export function LinhasResumo({ i, className }: { i: Pick<Intimacao, "resumo">; className?: string }) {
  if (!i.resumo) return null;
  const [decisao, providencia] = i.resumo.texto.split("\n");
  return (
    <div className={clsx("flex gap-2 text-sm", className)}>
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-label="Resumo automático" />
      <div className="min-w-0">
        <p className="text-slate-800">{decisao}</p>
        {providencia && <p className="mt-0.5 font-medium text-slate-900">{providencia}</p>}
      </div>
    </div>
  );
}

/** Botão que pede o resumo de uma ou mais intimações. Some quando o resumo não está ligado. */
export function BotaoResumir({ ids, rotulo = "Resumir", className }: { ids: string[]; rotulo?: string; className?: string }) {
  const disponivel = useResumoDisponivel();
  const { resumir } = useStore();
  const { toast } = useToast();
  const [ocupado, setOcupado] = useState(false);
  if (!disponivel || !ids.length) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={className}
      icon={<Sparkles className="h-4 w-4" />}
      loading={ocupado}
      onClick={async () => {
        setOcupado(true);
        try {
          const r = await resumir(ids);
          if (r.falhas && !r.resumidas) toast("Não foi possível resumir agora", { tom: "error", descricao: "Tente de novo em alguns minutos." });
          else if (r.falhas) toast(`${r.resumidas} resumida(s), ${r.falhas} ficaram para depois`);
          else if (ids.length > 1) toast(`${r.resumidas} intimação(ões) resumida(s)`);
        } catch (e) {
          toast("Não foi possível resumir", { tom: "error", descricao: e instanceof Error ? e.message : undefined });
        } finally {
          setOcupado(false);
        }
      }}
    >
      {rotulo}
    </Button>
  );
}
