"use client";

import { useEffect, useRef } from "react";
import { desenharTribunal } from "./cena";

/**
 * Fundo do topo da página inicial: o tribunal ateniense desenhado em luz (ver cena.ts).
 * Quem pede menos movimento vê a cena pronta e parada. A animação pausa com a aba
 * escondida ou com o topo fora da tela, e para de vez ao sair da página.
 */
export function FundoTribunal({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const menosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");

    let visivel = true;
    const observador = new IntersectionObserver(([e]) => (visivel = e.isIntersecting));
    observador.observe(canvas);

    let destruir: (() => void) | undefined;
    const iniciar = () => {
      destruir?.();
      try {
        destruir = desenharTribunal(canvas, { parado: menosMovimento.matches, pausado: () => document.hidden || !visivel });
      } catch {
        destruir = undefined;
      }
    };
    iniciar();
    menosMovimento.addEventListener("change", iniciar);

    return () => {
      menosMovimento.removeEventListener("change", iniciar);
      observador.disconnect();
      destruir?.();
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
