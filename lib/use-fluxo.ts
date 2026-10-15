"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./auth/api";
import type { EventoFluxo, FluxoProcesso } from "./fluxo/modelo";
import type { FaseProcesso, Processo } from "./processos";

export interface ResultadoLote {
  id: string;
  ok: boolean;
  mensagem?: string;
  bloqueios?: string[];
}

/** Chamadas da Central de casos. O servidor confere tudo de novo; a tela só antecipa. */
export const apiFluxo = {
  painel: () => api<{ processos: Processo[]; fluxos: Record<string, FluxoProcesso> }>("/api/fluxo"),
  ficha: (id: string, signal?: AbortSignal) => api<{ processo: Processo; fluxo: FluxoProcesso; eventos: EventoFluxo[] }>(`/api/fluxo/${encodeURIComponent(id)}`, { signal }),
  transicionar: (id: string, para: FaseProcesso, versao: number, motivo?: string) =>
    api<{ processo: Processo; fluxo: FluxoProcesso; evento: EventoFluxo }>(`/api/fluxo/${encodeURIComponent(id)}/transicao`, { body: { para, versao, motivo } }),
  marcar: (id: string, item: string, feito: boolean, versao: number) => api<{ fluxo: FluxoProcesso; evento?: EventoFluxo }>(`/api/fluxo/${encodeURIComponent(id)}/checklist`, { body: { item, feito, versao } }),
  lote: (corpo: { acao: "avancar" } | { acao: "atribuir"; responsavelId: string | null }, ids: string[]) => api<{ resultados: ResultadoLote[] }>("/api/fluxo/lote", { body: { ...corpo, ids } }),
  /** Grava campos do cadastro sem mudar a etapa (a edição manda o processo inteiro). */
  salvarCampos: (p: Processo, campos: Partial<Processo>) => api<{ processo: Processo }>(`/api/processos/${encodeURIComponent(p.id)}`, { method: "PUT", body: { ...p, ...campos, fase: p.fase } }),
};

/** Processos e estado da Central, com troca local depois de cada gravação. */
export function useFluxo() {
  const [dados, setDados] = useState<{ processos: Processo[]; fluxos: Record<string, FluxoProcesso> }>();
  const [erro, setErro] = useState<string>();

  const recarregar = useCallback(async () => {
    try {
      setDados(await apiFluxo.painel());
      setErro(undefined);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  /** Troca um processo e/ou o estado dele sem ir ao servidor. */
  const aplicar = useCallback((processo?: Processo, fluxo?: FluxoProcesso) => {
    setDados((d) => {
      if (!d) return d;
      const id = processo?.id ?? fluxo?.processoId;
      return {
        processos: processo ? d.processos.map((p) => (p.id === processo.id ? processo : p)) : d.processos,
        fluxos: fluxo && id ? { ...d.fluxos, [id]: fluxo } : d.fluxos,
      };
    });
  }, []);

  return { processos: dados?.processos, fluxos: dados?.fluxos ?? {}, erro, carregando: !dados && !erro, recarregar, aplicar };
}
