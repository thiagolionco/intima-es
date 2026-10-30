"use client";

import { CircleHelp, Lightbulb, Mail, Settings2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { useUsuario } from "@/lib/auth/sessao";
import { chaveDicas, type Dica, dicaDaRota, dicaParaMostrar, type EstadoDicas, lerEstado, type Posicao, posicionarBalao, type Retangulo } from "@/lib/dicas";

interface DicasApi {
  ligadas: boolean;
  ligar(ligadas: boolean): void;
  /** Volta a mostrar todas as dicas, uma vez em cada tela. */
  recomecar(): void;
  /** A tela atual tem dica? */
  temDicaAqui: boolean;
  mostrarDicaAqui(): void;
}

const DicasContexto = createContext<DicasApi | null>(null);

export function useDicas() {
  const c = useContext(DicasContexto);
  if (!c) throw new Error("useDicas fora do DicasProvider");
  return c;
}

/**
 * Mostra a dica de cada tela na primeira vez que a pessoa a abre.
 * A escolha fica no navegador, por conta: cada aparelho mostra as dicas uma vez.
 */
export function DicasProvider({ children }: { children: ReactNode }) {
  const usuario = useUsuario();
  const pathname = usePathname();
  const [estado, setEstado] = useState<EstadoDicas | null>(null);
  const [aberta, setAberta] = useState<Dica | null>(null);

  useEffect(() => {
    let bruto: string | null = null;
    try {
      bruto = localStorage.getItem(chaveDicas(usuario.id));
    } catch {}
    setEstado(lerEstado(bruto));
  }, [usuario.id]);

  const gravar = useCallback(
    (novo: EstadoDicas) => {
      setEstado(novo);
      try {
        localStorage.setItem(chaveDicas(usuario.id), JSON.stringify(novo));
      } catch {}
    },
    [usuario.id],
  );

  // Ao abrir uma tela: mostra a dica dela se ainda não foi vista, e já a dá por vista.
  useEffect(() => {
    if (!estado) return;
    const d = dicaParaMostrar(pathname, estado);
    setAberta(d ?? null);
    if (d) gravar({ ...estado, vistas: [...estado.vistas, d.id] });
    // Só a troca de tela decide; mudar o estado aqui não deve reabrir nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, estado === null]);

  const api = useMemo<DicasApi>(
    () => ({
      ligadas: estado?.ligadas ?? true,
      ligar: (ligadas) => {
        gravar({ ...(estado ?? lerEstado(null)), ligadas });
        if (!ligadas) setAberta(null);
      },
      recomecar: () => gravar({ ligadas: true, vistas: [] }),
      temDicaAqui: Boolean(dicaDaRota(pathname)),
      mostrarDicaAqui: () => setAberta(dicaDaRota(pathname) ?? null),
    }),
    [estado, gravar, pathname],
  );

  return (
    <DicasContexto.Provider value={api}>
      {children}
      {aberta && (
        <Balao
          key={aberta.id}
          dica={aberta}
          fechar={() => setAberta(null)}
          desligar={() => {
            api.ligar(false);
          }}
        />
      )}
    </DicasContexto.Provider>
  );
}

function visivel(el: Element) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function acharAlvo(seletores: string[]): HTMLElement | null {
  for (const s of seletores) {
    const el = Array.from(document.querySelectorAll<HTMLElement>(s)).find(visivel);
    if (el) return el;
  }
  return null;
}

const ESPACO = 6;

/** Balão ao lado do elemento explicado. Não bloqueia a página: dá para seguir usando a tela com ele aberto. */
function Balao({ dica, fechar, desligar }: { dica: Dica; fechar: () => void; desligar: () => void }) {
  const balao = useRef<HTMLDivElement>(null);
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);
  const [procurando, setProcurando] = useState(true);
  const [rect, setRect] = useState<Retangulo | null>(null);
  const [pos, setPos] = useState<Posicao | null>(null);

  // As telas carregam dados antes de mostrar o título: espera o alvo aparecer.
  useEffect(() => {
    let vivo = true;
    const inicio = Date.now();
    const tentar = () => {
      if (!vivo) return;
      const el = acharAlvo(dica.alvos);
      if (el) {
        setAlvo(el);
        setProcurando(false);
      } else if (Date.now() - inicio > 5000) setProcurando(false);
      else setTimeout(tentar, 150);
    };
    tentar();
    return () => {
      vivo = false;
    };
  }, [dica]);

  useEffect(() => {
    if (!alvo) return;
    const medir = () => {
      const r = alvo.getBoundingClientRect();
      setRect({ top: r.top - ESPACO, left: r.left - ESPACO, width: r.width + ESPACO * 2, height: r.height + ESPACO * 2 });
    };
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    const obs = new ResizeObserver(medir);
    obs.observe(alvo);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
      obs.disconnect();
    };
  }, [alvo]);

  useLayoutEffect(() => {
    if (procurando || !balao.current) return;
    const b = balao.current.getBoundingClientRect();
    setPos(posicionarBalao(rect, { largura: window.innerWidth, altura: window.innerHeight }, { largura: b.width, altura: b.height }));
  }, [rect, procurando]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar]);

  // O alvo saiu da tela (rolagem): o balão some junto e volta quando ele voltar.
  const foraDaTela = rect !== null && (rect.top + rect.height < 0 || rect.top > window.innerHeight);

  return (
    <>
      {rect && !foraDaTela && (
        <div
          className="pointer-events-none fixed z-[55] rounded-xl ring-2 ring-brand-400 ring-offset-2 transition-all duration-200"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          aria-hidden
        />
      )}
      <div
        ref={balao}
        role="dialog"
        aria-labelledby="dica-titulo"
        aria-describedby="dica-texto"
        className={clsx(
          "fixed z-[56] w-[min(22rem,calc(100vw-2rem))] animate-slide-in rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-900/10 transition-opacity duration-150",
          procurando || !pos || foraDaTela ? "pointer-events-none opacity-0" : "opacity-100",
        )}
        style={pos ? { top: pos.top, left: pos.left } : { top: 16, left: 16 }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-600">
            <Lightbulb className="h-3.5 w-3.5" aria-hidden />
            Dica
          </p>
          <button onClick={fechar} className="-m-1 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar a dica">
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 id="dica-titulo" className="mt-1 text-base font-semibold text-slate-900">
          {dica.titulo}
        </h2>
        <p id="dica-texto" className="mt-1.5 text-sm leading-relaxed text-slate-600">
          {dica.texto}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button onClick={desligar} className="rounded-md px-2 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700">
            Não mostrar mais dicas
          </button>
          <button
            onClick={fechar}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            Entendi
          </button>
        </div>
      </div>
    </>
  );
}

/** Botão de ajuda da barra: a dica desta tela, a configuração das dicas e o contato. */
export function MenuAjuda() {
  const { temDicaAqui, mostrarDicaAqui } = useDicas();
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => raiz.current && !raiz.current.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const item = "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-slate-50";

  return (
    <div className="relative" ref={raiz}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="rounded-md p-2 text-slate-300 hover:bg-white/10"
        aria-label="Ajuda"
        aria-haspopup="menu"
        aria-expanded={aberto}
      >
        <CircleHelp className="h-5 w-5" aria-hidden />
      </button>
      {aberto && (
        <div
          role="menu"
          className="fixed inset-x-4 top-14 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-slate-700 shadow-lg lg:absolute lg:inset-x-auto lg:right-0 lg:top-full lg:mt-2 lg:w-64"
        >
          {temDicaAqui && (
            <button
              role="menuitem"
              onClick={() => {
                setAberto(false);
                mostrarDicaAqui();
              }}
              className={item}
            >
              <Lightbulb className="h-4 w-4 text-slate-400" aria-hidden />
              Ver a dica desta tela
            </button>
          )}
          <Link href="/conta?aba=preferencias" role="menuitem" onClick={() => setAberto(false)} className={item}>
            <Settings2 className="h-4 w-4 text-slate-400" aria-hidden />
            Configurar dicas
          </Link>
          <Link href="/contato" role="menuitem" onClick={() => setAberto(false)} className={item}>
            <Mail className="h-4 w-4 text-slate-400" aria-hidden />
            Falar com o Clepsa
          </Link>
        </div>
      )}
    </div>
  );
}
