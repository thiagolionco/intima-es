"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./auth/api";
import type { ResumoCobertura } from "./cobertura";

const CINCO_MINUTOS = 5 * 60_000;

/** Livro de cobertura resumido (Selo de Vigília). Relê a cada 5 minutos e ao voltar para a aba. */
export function useLerCobertura() {
  const [cobertura, setCobertura] = useState<ResumoCobertura>();
  const [erro, setErro] = useState<string>();

  const recarregar = useCallback(async () => {
    try {
      const r = await api<{ cobertura: ResumoCobertura }>("/api/cobertura");
      setCobertura(r.cobertura);
      setErro(undefined);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível conferir a vigília.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
    const t = setInterval(recarregar, CINCO_MINUTOS);
    const aoVoltar = () => document.visibilityState === "visible" && void recarregar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [recarregar]);

  return { cobertura, erro, recarregar };
}

type EstadoCobertura = ReturnType<typeof useLerCobertura>;

/** Uma leitura só para a casca do app e as telas dentro dela (ver AppShell). */
export const CoberturaContexto = createContext<EstadoCobertura>({ cobertura: undefined, erro: undefined, recarregar: async () => {} });

export const useCobertura = () => useContext(CoberturaContexto);
