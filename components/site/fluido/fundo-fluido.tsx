"use client";

import { useEffect, useRef, useState } from "react";
import { fluidSimulation } from "./motor";

/**
 * Fundo do topo da página inicial: a simulação de fluido em WebGL.
 *
 * - Quem pede menos movimento no sistema (prefers-reduced-motion) e quem não tem WebGL
 *   vê um degradê estático nas mesmas cores, sem animação.
 * - A simulação pausa com a aba escondida ou quando o topo sai da tela.
 * - Ao sair da página, para o laço, tira os ouvintes e libera a GPU.
 */
export function FundoFluido({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ativo, setAtivo] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const menosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (menosMovimento.matches) return;

    let visivel = true;
    const observador = new IntersectionObserver(([e]) => (visivel = e.isIntersecting));
    observador.observe(canvas);

    let destruir: (() => void) | undefined;
    try {
      destruir = fluidSimulation(canvas, { pausado: () => document.hidden || !visivel });
      setAtivo(true);
    } catch {
      setAtivo(false);
    }

    // Se a pessoa ligar "reduzir movimento" com a página aberta, a tinta para na hora.
    const aoMudar = () => {
      if (!menosMovimento.matches) return;
      destruir?.();
      destruir = undefined;
      setAtivo(false);
    };
    menosMovimento.addEventListener("change", aoMudar);

    return () => {
      menosMovimento.removeEventListener("change", aoMudar);
      observador.disconnect();
      destruir?.();
    };
  }, []);

  return (
    <>
      <div className={className} data-fundo-estatico aria-hidden style={{ opacity: ativo ? 0 : 1 }} />
      <canvas ref={ref} className={className} aria-hidden style={{ opacity: ativo ? 1 : 0 }} />
    </>
  );
}
