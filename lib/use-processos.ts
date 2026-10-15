"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ErroApi } from "./auth/api";
import type { Processo, UltimaMovimentacao } from "./processos";

const mensagem = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível carregar.");

/** Processos do escritório, lidos do servidor. */
export function useProcessos() {
  const [processos, setProcessos] = useState<Processo[]>();
  const [ultimas, setUltimas] = useState<Record<string, UltimaMovimentacao>>({});
  const [erro, setErro] = useState<string>();

  const recarregar = useCallback(async () => {
    try {
      const r = await api<{ processos: Processo[]; ultimasMovimentacoes?: Record<string, UltimaMovimentacao> }>("/api/processos");
      setProcessos(r.processos);
      setUltimas(r.ultimasMovimentacoes ?? {});
      setErro(undefined);
    } catch (e) {
      setErro(mensagem(e));
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { processos, ultimas, erro, carregando: !processos && !erro, recarregar };
}

/** Um processo; `processo` fica indefinido quando não existe (ou não é do escritório). */
export function useProcesso(id: string) {
  const [processo, setProcesso] = useState<Processo>();
  const [erro, setErro] = useState<string>();
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const controle = new AbortController();
    setCarregando(true);
    api<{ processo: Processo }>(`/api/processos/${encodeURIComponent(id)}`, { signal: controle.signal })
      .then((r) => {
        setProcesso(r.processo);
        setErro(undefined);
        setCarregando(false);
      })
      .catch((e) => {
        if (controle.signal.aborted) return;
        setProcesso(undefined);
        setErro(e instanceof ErroApi && e.codigo === "nao_encontrado" ? undefined : mensagem(e));
        setCarregando(false);
      });
    return () => controle.abort();
  }, [id]);

  /** `substituir` troca o processo na tela depois de uma gravação feita aqui. */
  return { processo, erro, carregando, substituir: setProcesso };
}
