"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./auth/api";

/** Carrega um endereço da API ao montar e quando ele muda; `recarregar` busca de novo. */
export function useApi<T>(url: string | null) {
  const [dados, setDados] = useState<T>();
  const [erro, setErro] = useState<string>();

  const recarregar = useCallback(async () => {
    if (!url) return;
    try {
      const r = await api<T>(url);
      setDados(r);
      setErro(undefined);
      return r;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar.");
    }
  }, [url]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { dados, erro, recarregar, setDados };
}

/** Mensagem de erro para mostrar ao usuário. */
export const mensagemDe = (e: unknown, padrao = "Algo deu errado. Tente de novo.") => (e instanceof Error ? e.message : padrao);
