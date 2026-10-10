"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, quandoSessaoExpirar } from "./api";
import type { UsuarioPublico } from "./tipos";

type Estado = { tipo: "carregando" } | { tipo: "anonimo" } | { tipo: "autenticado"; usuario: UsuarioPublico };

interface SessaoApi {
  estado: Estado;
  usuario: UsuarioPublico | null;
  /** Chamado pelas telas de login quando a API confirma o acesso. */
  entrou(usuario: UsuarioPublico): void;
  atualizarUsuario(usuario: UsuarioPublico): void;
  recarregar(): Promise<void>;
  sair(opcoes?: { motivo?: "expirou" }): Promise<void>;
}

const SessaoContext = createContext<SessaoApi | null>(null);

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const router = useRouter();

  const recarregar = useCallback(async () => {
    try {
      const { usuario } = await api<{ usuario: UsuarioPublico }>("/api/auth/sessao", { silencioso401: true });
      setEstado({ tipo: "autenticado", usuario });
    } catch {
      setEstado({ tipo: "anonimo" });
    }
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // Qualquer 401 em qualquer chamada derruba a sessão local e leva ao login.
  useEffect(
    () =>
      quandoSessaoExpirar(() => {
        setEstado({ tipo: "anonimo" });
        const para = window.location.pathname + window.location.search;
        router.replace(`/entrar?expirou=1${para && para !== "/" ? `&para=${encodeURIComponent(para)}` : ""}`);
      }),
    [router],
  );

  // Sair em uma aba encerra as outras abas também.
  useEffect(() => {
    let canal: BroadcastChannel | null = null;
    try {
      canal = new BroadcastChannel("controle-intimacoes:sessao");
      canal.onmessage = (e) => {
        if (e.data === "saiu") window.location.replace("/entrar?saiu=1");
        if (e.data === "entrou") recarregar();
      };
    } catch {}
    return () => canal?.close();
  }, [router, recarregar]);

  const avisarAbas = (msg: string) => {
    try {
      const c = new BroadcastChannel("controle-intimacoes:sessao");
      c.postMessage(msg);
      c.close();
    } catch {}
  };

  const entrou = useCallback((usuario: UsuarioPublico) => {
    setEstado({ tipo: "autenticado", usuario });
    avisarAbas("entrou");
  }, []);

  const atualizarUsuario = useCallback((usuario: UsuarioPublico) => setEstado({ tipo: "autenticado", usuario }), []);

  // Recarga completa ao sair: descarta da memória todo o espaço de trabalho do usuário.
  const sair = useCallback(async (opcoes?: { motivo?: "expirou" }) => {
    await api("/api/auth/sair", { method: "POST", body: {} }).catch(() => undefined);
    avisarAbas("saiu");
    window.location.replace(opcoes?.motivo ? `/entrar?${opcoes.motivo}=1` : "/entrar?saiu=1");
  }, []);

  const value = useMemo<SessaoApi>(
    () => ({ estado, usuario: estado.tipo === "autenticado" ? estado.usuario : null, entrou, atualizarUsuario, recarregar, sair }),
    [estado, entrou, atualizarUsuario, recarregar, sair],
  );

  // Revalida a sessão ao voltar para a aba (ela pode ter sido encerrada em outro dispositivo).
  useEffect(() => {
    const onVisivel = () => document.visibilityState === "visible" && estado.tipo === "autenticado" && recarregar();
    document.addEventListener("visibilitychange", onVisivel);
    return () => document.removeEventListener("visibilitychange", onVisivel);
  }, [estado.tipo, recarregar]);

  return <SessaoContext.Provider value={value}>{children}</SessaoContext.Provider>;
}

export function useSessao(): SessaoApi {
  const ctx = useContext(SessaoContext);
  if (!ctx) throw new Error("useSessao precisa estar dentro de <SessaoProvider>.");
  return ctx;
}

/** Atalho para telas internas, onde o usuário sempre existe. */
export function useUsuario(): UsuarioPublico {
  const { usuario } = useSessao();
  if (!usuario) throw new Error("Usuário não autenticado.");
  return usuario;
}
