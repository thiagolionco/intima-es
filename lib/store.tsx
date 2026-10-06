"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Intimacao, TermoMonitorado } from "./types";
import { chaveDeduplicacao, type IntimacaoImportada } from "./comunica";
import { uid } from "./utils";

const CHAVE_INTIMACOES = "controle-intimacoes:intimacoes:v1";
const CHAVE_TERMOS = "controle-intimacoes:termos:v1";

function ler<T>(chave: string, padrao: T): T {
  try {
    const bruto = window.localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave: string, valor: unknown): string | null {
  try {
    window.localStorage.setItem(chave, JSON.stringify(valor));
    return null;
  } catch (e) {
    return e instanceof Error && e.name === "QuotaExceededError"
      ? "O armazenamento local do navegador está cheio. Exporte e exclua intimações antigas."
      : "Não foi possível salvar os dados no navegador.";
  }
}

export type NovaIntimacao = Omit<Intimacao, "id" | "createdAt" | "updatedAt">;

interface StoreValue {
  ready: boolean;
  erroPersistencia: string | null;
  intimacoes: Intimacao[];
  termos: TermoMonitorado[];
  adicionarIntimacao: (dados: NovaIntimacao) => Intimacao;
  atualizarIntimacao: (id: string, dados: Partial<NovaIntimacao>) => void;
  excluirIntimacao: (id: string) => void;
  excluirIntimacoes: (ids: string[]) => void;
  importarDoComunica: (itens: IntimacaoImportada[], cliente: string) => { novas: number; duplicadas: number };
  existeNoAcervo: (item: IntimacaoImportada) => boolean;
  substituirTudo: (intimacoes: Intimacao[], termos?: TermoMonitorado[]) => void;
  adicionarTermo: (t: Omit<TermoMonitorado, "id" | "createdAt">) => void;
  atualizarTermo: (id: string, t: Partial<TermoMonitorado>) => void;
  excluirTermo: (id: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [intimacoes, setIntimacoes] = useState<Intimacao[]>([]);
  const [termos, setTermos] = useState<TermoMonitorado[]>([]);
  const [erroPersistencia, setErro] = useState<string | null>(null);
  const carregado = useRef(false);

  // Carrega do localStorage apenas no cliente, evitando divergência de hidratação.
  useEffect(() => {
    setIntimacoes(ler<Intimacao[]>(CHAVE_INTIMACOES, []));
    setTermos(ler<TermoMonitorado[]>(CHAVE_TERMOS, []));
    carregado.current = true;
    setReady(true);

    // Mantém várias abas sincronizadas.
    const onStorage = (e: StorageEvent) => {
      if (e.key === CHAVE_INTIMACOES) setIntimacoes(ler(CHAVE_INTIMACOES, []));
      if (e.key === CHAVE_TERMOS) setTermos(ler(CHAVE_TERMOS, []));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (carregado.current) setErro(gravar(CHAVE_INTIMACOES, intimacoes));
  }, [intimacoes]);

  useEffect(() => {
    if (carregado.current) gravar(CHAVE_TERMOS, termos);
  }, [termos]);

  const adicionarIntimacao = useCallback((dados: NovaIntimacao) => {
    const agora = new Date().toISOString();
    const nova: Intimacao = { ...dados, id: uid(), createdAt: agora, updatedAt: agora };
    setIntimacoes((l) => [nova, ...l]);
    return nova;
  }, []);

  const atualizarIntimacao = useCallback((id: string, dados: Partial<NovaIntimacao>) => {
    setIntimacoes((l) => l.map((i) => (i.id === id ? { ...i, ...dados, updatedAt: new Date().toISOString() } : i)));
  }, []);

  const excluirIntimacao = useCallback((id: string) => {
    setIntimacoes((l) => l.filter((i) => i.id !== id));
  }, []);

  const excluirIntimacoes = useCallback((ids: string[]) => {
    const set = new Set(ids);
    setIntimacoes((l) => l.filter((i) => !set.has(i.id)));
  }, []);

  const chaves = useMemo(() => new Set(intimacoes.map(chaveDeduplicacao)), [intimacoes]);

  const existeNoAcervo = useCallback((item: IntimacaoImportada) => chaves.has(chaveDeduplicacao(item)), [chaves]);

  const importarDoComunica = useCallback(
    (itens: IntimacaoImportada[], cliente: string) => {
      const vistos = new Set(chaves);
      const agora = new Date().toISOString();
      const novas: Intimacao[] = [];
      let duplicadas = 0;
      for (const item of itens) {
        const k = chaveDeduplicacao(item);
        if (vistos.has(k)) {
          duplicadas++;
          continue;
        }
        vistos.add(k);
        novas.push({ ...item, id: uid(), cliente, status: "nova", createdAt: agora, updatedAt: agora });
      }
      if (novas.length) setIntimacoes((l) => [...novas, ...l]);
      return { novas: novas.length, duplicadas };
    },
    [chaves],
  );

  const substituirTudo = useCallback((novas: Intimacao[], novosTermos?: TermoMonitorado[]) => {
    setIntimacoes(novas);
    if (novosTermos) setTermos(novosTermos);
  }, []);

  const adicionarTermo = useCallback((t: Omit<TermoMonitorado, "id" | "createdAt">) => {
    setTermos((l) => [...l, { ...t, id: uid(), createdAt: new Date().toISOString() }]);
  }, []);

  const atualizarTermo = useCallback((id: string, t: Partial<TermoMonitorado>) => {
    setTermos((l) => l.map((x) => (x.id === id ? { ...x, ...t } : x)));
  }, []);

  const excluirTermo = useCallback((id: string) => {
    setTermos((l) => l.filter((x) => x.id !== id));
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      erroPersistencia,
      intimacoes,
      termos,
      adicionarIntimacao,
      atualizarIntimacao,
      excluirIntimacao,
      excluirIntimacoes,
      importarDoComunica,
      existeNoAcervo,
      substituirTudo,
      adicionarTermo,
      atualizarTermo,
      excluirTermo,
    }),
    [ready, erroPersistencia, intimacoes, termos, adicionarIntimacao, atualizarIntimacao, excluirIntimacao, excluirIntimacoes, importarDoComunica, existeNoAcervo, substituirTudo, adicionarTermo, atualizarTermo, excluirTermo],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore precisa estar dentro de <StoreProvider>.");
  return ctx;
}
