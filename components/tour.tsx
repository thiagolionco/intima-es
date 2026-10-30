"use client";

import clsx from "clsx";
import { ArrowLeft, ArrowRight, CircleHelp, Compass, Mail, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useUsuario } from "@/lib/auth/sessao";
import { chaveTourVisto, PASSOS_TOUR, type Posicao, posicionarBalao, type Retangulo } from "@/lib/tour";

interface TourApi {
  iniciar(): void;
}

const TourContexto = createContext<TourApi>({ iniciar: () => undefined });

export const useTour = () => useContext(TourContexto);

function marcarVisto(usuarioId: string) {
  try {
    localStorage.setItem(chaveTourVisto(usuarioId), new Date().toISOString());
  } catch {}
}

function jaViu(usuarioId: string) {
  try {
    return Boolean(localStorage.getItem(chaveTourVisto(usuarioId)));
  } catch {
    // Sem acesso ao armazenamento (janela anônima restrita): melhor não insistir a cada página.
    return true;
  }
}

function visivel(el: Element) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function acharAlvo(seletores: string[] | undefined): HTMLElement | null {
  for (const s of seletores ?? []) {
    const el = Array.from(document.querySelectorAll<HTMLElement>(s)).find(visivel);
    if (el) return el;
  }
  return null;
}

/** Abre o tour sozinho no primeiro acesso de cada conta (neste navegador) e quando pedido pela Ajuda. */
export function TourProvider({ children }: { children: ReactNode }) {
  const usuario = useUsuario();
  const [passo, setPasso] = useState<number | null>(null);

  useEffect(() => {
    if (!jaViu(usuario.id)) setPasso(0);
  }, [usuario.id]);

  const encerrar = useCallback(() => {
    marcarVisto(usuario.id);
    setPasso(null);
  }, [usuario.id]);

  const api = useMemo<TourApi>(() => ({ iniciar: () => setPasso(0) }), []);

  return (
    <TourContexto.Provider value={api}>
      {children}
      {passo !== null && <Balao indice={passo} irPara={setPasso} encerrar={encerrar} />}
    </TourContexto.Provider>
  );
}

const ESPACO = 6;

function Balao({ indice, irPara, encerrar }: { indice: number; irPara: (i: number) => void; encerrar: () => void }) {
  const passo = PASSOS_TOUR[indice];
  const ultimo = indice === PASSOS_TOUR.length - 1;
  const router = useRouter();
  const pathname = usePathname();
  const balao = useRef<HTMLDivElement>(null);
  const botaoPrincipal = useRef<HTMLButtonElement>(null);
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);
  const [procurando, setProcurando] = useState(true);
  const [rect, setRect] = useState<Retangulo | null>(null);
  const [pos, setPos] = useState<Posicao | null>(null);

  // Abre a página do passo e espera o elemento aparecer (as telas carregam dados antes do título).
  useEffect(() => {
    setAlvo(null);
    setRect(null);
    setProcurando(true);
    if (passo.rota && pathname !== passo.rota) {
      router.push(passo.rota);
      return;
    }
    if (!passo.alvos) {
      setProcurando(false);
      return;
    }
    let vivo = true;
    const inicio = Date.now();
    const tentar = () => {
      if (!vivo) return;
      const el = acharAlvo(passo.alvos);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
        setAlvo(el);
        setProcurando(false);
      } else if (Date.now() - inicio > 4000) setProcurando(false);
      else setTimeout(tentar, 120);
    };
    tentar();
    return () => {
      vivo = false;
    };
  }, [passo, pathname, router]);

  // Acompanha o alvo quando a tela rola ou muda de tamanho.
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
  }, [rect, procurando, indice]);

  useEffect(() => {
    if (!procurando) botaoPrincipal.current?.focus({ preventScroll: true });
  }, [procurando, indice]);

  const avancar = useCallback(() => (ultimo ? encerrar() : irPara(indice + 1)), [ultimo, encerrar, irPara, indice]);
  const voltar = useCallback(() => indice > 0 && irPara(indice - 1), [indice, irPara]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") encerrar();
      else if (e.key === "ArrowRight") avancar();
      else if (e.key === "ArrowLeft") voltar();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [encerrar, avancar, voltar]);

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      {/* O escurecido bloqueia cliques na página; o recorte deixa o alvo à vista. */}
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-brand-400 transition-all duration-200"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, boxShadow: "0 0 0 9999px rgb(15 23 42 / 0.6)" }}
          aria-hidden
        />
      ) : (
        <div className="fixed inset-0 bg-slate-900/60" aria-hidden />
      )}
      <div className="fixed inset-0" aria-hidden />

      <div
        ref={balao}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-titulo"
        aria-describedby="tour-texto"
        className={clsx(
          "fixed w-[min(22rem,calc(100vw-2rem))] rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-900/5 transition-opacity duration-150",
          procurando || !pos ? "opacity-0" : "opacity-100",
        )}
        style={pos ? { top: pos.top, left: pos.left } : { top: 16, left: 16 }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">
            Passo {indice + 1} de {PASSOS_TOUR.length}
          </p>
          <button onClick={encerrar} className="-m-1 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar o tour">
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 id="tour-titulo" className="mt-1 text-base font-semibold text-slate-900">
          {passo.titulo}
        </h2>
        <p id="tour-texto" className="mt-1.5 text-sm leading-relaxed text-slate-600">
          {passo.texto}
        </p>

        <div className="mt-4 flex gap-1" aria-hidden>
          {PASSOS_TOUR.map((p, i) => (
            <span key={p.id} className={clsx("h-1 flex-1 rounded-full", i <= indice ? "bg-brand-500" : "bg-slate-200")} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          {ultimo ? (
            <span />
          ) : (
            <button onClick={encerrar} className="rounded-md px-2 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700">
              Pular tour
            </button>
          )}
          <div className="flex gap-2">
            {indice > 0 && (
              <button onClick={voltar} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Voltar
              </button>
            )}
            <button
              ref={botaoPrincipal}
              onClick={avancar}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
            >
              {ultimo ? "Concluir" : indice === 0 ? "Começar" : "Próximo"}
              {!ultimo && <ArrowRight className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Botão de ajuda da barra: rever o tour guiado ou falar com a equipe do Clepsa. */
export function MenuAjuda({ celular }: { celular?: boolean }) {
  const { iniciar } = useTour();
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

  return (
    <div className="relative" ref={raiz}>
      <button
        type="button"
        data-tour={celular ? "ajuda-celular" : "ajuda"}
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
          className="fixed inset-x-4 top-14 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-slate-700 shadow-lg lg:absolute lg:inset-x-auto lg:right-0 lg:top-full lg:mt-2 lg:w-60"
        >
          <button
            role="menuitem"
            onClick={() => {
              setAberto(false);
              iniciar();
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-slate-50"
          >
            <Compass className="h-4 w-4 text-slate-400" aria-hidden />
            Fazer o tour guiado
          </button>
          <Link href="/contato" role="menuitem" onClick={() => setAberto(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-slate-50">
            <Mail className="h-4 w-4 text-slate-400" aria-hidden />
            Falar com o Clepsa
          </Link>
        </div>
      )}
    </div>
  );
}
