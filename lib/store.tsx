"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Intimacao, Suspensao, TermoMonitorado } from "./types";
import { aplicarRegra, sugerirRegra } from "./prazos/calculo";
import { chaveDeduplicacao, type IntimacaoImportada } from "./comunica";
import { api, ErroApi } from "./auth/api";
import { uid } from "./utils";

/** Chaves usadas pela Versão 1, quando os dados ficavam só no navegador. */
const CHAVE_V1_INTIMACOES = "controle-intimacoes:intimacoes:v1";
const CHAVE_V1_TERMOS = "controle-intimacoes:termos:v1";

interface Instantaneo {
  intimacoes: Intimacao[];
  termos: TermoMonitorado[];
  suspensoes?: Suspensao[];
  revisao: number;
}

/**
 * Onde o espaço de trabalho é persistido. A store depende só desta interface; a implementação
 * padrão conversa com a API, e os testes ou um modo offline podem fornecer outra.
 */
export interface RepositorioEspaco {
  carregar(): Promise<Instantaneo>;
  salvar(dados: Instantaneo): Promise<{ revisao: number }>;
}

export const repositorioApi: RepositorioEspaco = {
  carregar: () => api<Instantaneo>("/api/espaco"),
  salvar: (dados) => api<{ revisao: number }>("/api/espaco", { method: "PUT", body: dados }),
};

function lerV1(): { intimacoes: Intimacao[]; termos: TermoMonitorado[] } | null {
  try {
    const i = JSON.parse(window.localStorage.getItem(CHAVE_V1_INTIMACOES) || "[]") as Intimacao[];
    const t = JSON.parse(window.localStorage.getItem(CHAVE_V1_TERMOS) || "[]") as TermoMonitorado[];
    return Array.isArray(i) && Array.isArray(t) && (i.length || t.length) ? { intimacoes: i, termos: t } : null;
  } catch {
    return null;
  }
}

export type EstadoSincronizacao = "carregando" | "salvo" | "pendente" | "salvando" | "erro";

export type NovaIntimacao = Omit<Intimacao, "id" | "createdAt" | "updatedAt">;

interface StoreValue {
  ready: boolean;
  erroPersistencia: string | null;
  sincronizacao: EstadoSincronizacao;
  ultimaGravacao: Date | null;
  /** Dados da Versão 1 encontrados neste navegador, que podem ser trazidos para a conta. */
  dadosLegados: { intimacoes: number; termos: number } | null;
  importarDadosLegados: () => { intimacoes: number; termos: number };
  descartarDadosLegados: () => void;
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
  /** Feriados locais e suspensões de prazo do escritório. */
  suspensoes: Suspensao[];
  /** Troca a lista de suspensões e recalcula os prazos em aberto que têm regra. */
  salvarSuspensoes: (lista: Suspensao[]) => void;
  /** Lê o prazo no texto das intimações em aberto que ainda não têm prazo. Devolve quantas ganharam prazo. */
  calcularPrazosPendentes: () => number;
}

const emAberto = (i: Intimacao) => i.status === "nova" || i.status === "em_analise";

const StoreContext = createContext<StoreValue | null>(null);

const ESPERA_GRAVACAO_MS = 700;

/**
 * Estado do espaço de trabalho do usuário logado. Carrega da API ao montar e grava as
 * alterações em segundo plano (com agrupamento e controle de concorrência por revisão).
 */
export function StoreProvider({ children, repositorio = repositorioApi, onConflito }: { children: ReactNode; repositorio?: RepositorioEspaco; onConflito?: () => void }) {
  const [ready, setReady] = useState(false);
  const [intimacoes, setIntimacoes] = useState<Intimacao[]>([]);
  const [termos, setTermos] = useState<TermoMonitorado[]>([]);
  const [suspensoes, setSuspensoes] = useState<Suspensao[]>([]);
  const [erroPersistencia, setErro] = useState<string | null>(null);
  const [sincronizacao, setSincronizacao] = useState<EstadoSincronizacao>("carregando");
  const [ultimaGravacao, setUltimaGravacao] = useState<Date | null>(null);
  const [legado, setLegado] = useState<ReturnType<typeof lerV1>>(null);

  const revisao = useRef(0);
  const ignorarProxima = useRef(true);
  const atual = useRef<{ intimacoes: Intimacao[]; termos: TermoMonitorado[]; suspensoes: Suspensao[] }>({ intimacoes: [], termos: [], suspensoes: [] });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const emVoo = useRef(false);
  const pendente = useRef(false);

  const carregar = useCallback(async () => {
    try {
      const dados = await repositorio.carregar();
      revisao.current = dados.revisao;
      ignorarProxima.current = true;
      setIntimacoes(dados.intimacoes);
      setTermos(dados.termos);
      setSuspensoes(dados.suspensoes ?? []);
      setErro(null);
      setSincronizacao("salvo");
      setReady(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar seus dados.");
      setSincronizacao("erro");
    }
  }, [repositorio]);

  useEffect(() => {
    carregar();
    setLegado(lerV1());
  }, [carregar]);

  const gravar = useCallback(async () => {
    if (emVoo.current) {
      pendente.current = true;
      return;
    }
    emVoo.current = true;
    pendente.current = false;
    setSincronizacao("salvando");
    try {
      const { revisao: nova } = await repositorio.salvar({ ...atual.current, revisao: revisao.current });
      revisao.current = nova;
      setErro(null);
      setUltimaGravacao(new Date());
      setSincronizacao(pendente.current ? "pendente" : "salvo");
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === "conflito") {
        // Outra aba/dispositivo gravou antes: trazemos a versão mais recente do servidor.
        pendente.current = false;
        await carregar();
        onConflito?.();
      } else {
        setErro(e instanceof Error ? e.message : "Não foi possível salvar seus dados.");
        setSincronizacao("erro");
      }
    } finally {
      emVoo.current = false;
      if (pendente.current) gravar();
    }
  }, [repositorio, carregar, onConflito]);

  useEffect(() => {
    atual.current = { intimacoes, termos, suspensoes };
    if (!ready) return;
    if (ignorarProxima.current) {
      ignorarProxima.current = false;
      return;
    }
    setSincronizacao("pendente");
    clearTimeout(timer.current);
    timer.current = setTimeout(gravar, ESPERA_GRAVACAO_MS);
  }, [intimacoes, termos, suspensoes, ready, gravar]);

  // Ao voltar para a aba, traz o que foi alterado em outra aba ou dispositivo.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && sincronizacao === "salvo" && !emVoo.current) carregar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [sincronizacao, carregar]);

  // Avisa antes de fechar a aba com alterações ainda não gravadas.
  useEffect(() => {
    const antesDeSair = (e: BeforeUnloadEvent) => {
      if (sincronizacao === "pendente" || sincronizacao === "salvando") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", antesDeSair);
    return () => window.removeEventListener("beforeunload", antesDeSair);
  }, [sincronizacao]);

  const descartarDadosLegados = useCallback(() => {
    try {
      window.localStorage.removeItem(CHAVE_V1_INTIMACOES);
      window.localStorage.removeItem(CHAVE_V1_TERMOS);
    } catch {}
    setLegado(null);
  }, []);

  const adicionarIntimacao = useCallback((dados: NovaIntimacao) => {
    const agora = new Date().toISOString();
    const nova: Intimacao = aplicarRegra({ ...dados, id: uid(), createdAt: agora, updatedAt: agora }, atual.current.suspensoes);
    setIntimacoes((l) => [nova, ...l]);
    return nova;
  }, []);

  const atualizarIntimacao = useCallback((id: string, dados: Partial<NovaIntimacao>) => {
    setIntimacoes((l) => l.map((i) => (i.id === id ? aplicarRegra({ ...i, ...dados, updatedAt: new Date().toISOString() }, atual.current.suspensoes) : i)));
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
        const regraPrazo = sugerirRegra(item) ?? undefined;
        novas.push(aplicarRegra({ ...item, id: uid(), cliente, status: "nova", regraPrazo, createdAt: agora, updatedAt: agora }, atual.current.suspensoes));
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

  const importarDadosLegados = useCallback(() => {
    const dados = legado ?? { intimacoes: [], termos: [] };
    const ids = new Set(atual.current.intimacoes.map((i) => i.id));
    const chaves = new Set(atual.current.intimacoes.map(chaveDeduplicacao));
    const novas = dados.intimacoes.filter((i) => !ids.has(i.id) && !(i.origem === "comunica" && chaves.has(chaveDeduplicacao(i))));
    const idsTermos = new Set(atual.current.termos.map((t) => t.id));
    const novosTermos = dados.termos.filter((t) => !idsTermos.has(t.id));
    setIntimacoes((l) => [...novas, ...l]);
    setTermos((l) => [...l, ...novosTermos]);
    descartarDadosLegados();
    return { intimacoes: novas.length, termos: novosTermos.length };
  }, [legado, descartarDadosLegados]);

  const adicionarTermo = useCallback((t: Omit<TermoMonitorado, "id" | "createdAt">) => {
    setTermos((l) => [...l, { ...t, id: uid(), createdAt: new Date().toISOString() }]);
  }, []);

  const atualizarTermo = useCallback((id: string, t: Partial<TermoMonitorado>) => {
    setTermos((l) => l.map((x) => (x.id === id ? { ...x, ...t } : x)));
  }, []);

  const excluirTermo = useCallback((id: string) => {
    setTermos((l) => l.filter((x) => x.id !== id));
  }, []);

  const salvarSuspensoes = useCallback((lista: Suspensao[]) => {
    setSuspensoes(lista);
    setIntimacoes((l) => l.map((i) => (emAberto(i) ? aplicarRegra(i, lista) : i)));
  }, []);

  const calcularPrazosPendentes = useCallback(() => {
    const agora = new Date().toISOString();
    let calculadas = 0;
    const lista = atual.current.intimacoes.map((i) => {
      if (!emAberto(i) || i.prazo || i.regraPrazo) return i;
      const regraPrazo = sugerirRegra(i);
      if (!regraPrazo) return i;
      calculadas++;
      return aplicarRegra({ ...i, regraPrazo, updatedAt: agora }, atual.current.suspensoes);
    });
    if (calculadas) setIntimacoes(lista);
    return calculadas;
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      erroPersistencia,
      sincronizacao,
      ultimaGravacao,
      dadosLegados: legado ? { intimacoes: legado.intimacoes.length, termos: legado.termos.length } : null,
      importarDadosLegados,
      descartarDadosLegados,
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
      suspensoes,
      salvarSuspensoes,
      calcularPrazosPendentes,
    }),
    [suspensoes, salvarSuspensoes, calcularPrazosPendentes, ready, erroPersistencia, sincronizacao, ultimaGravacao, legado, importarDadosLegados, descartarDadosLegados, intimacoes, termos, adicionarIntimacao, atualizarIntimacao, excluirIntimacao, excluirIntimacoes, importarDoComunica, existeNoAcervo, substituirTudo, adicionarTermo, atualizarTermo, excluirTermo],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore precisa estar dentro de <StoreProvider>.");
  return ctx;
}
