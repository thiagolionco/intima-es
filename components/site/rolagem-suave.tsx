"use client";

import Lenis from "lenis";
import { useEffect } from "react";

/** Rolagem suave (Lenis) na página inicial. Desligada para quem pede menos movimento. */
export function RolagemSuave() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ smoothWheel: true, anchors: true });
    let quadro = 0;
    const raf = (t: number) => {
      lenis.raf(t);
      quadro = requestAnimationFrame(raf);
    };
    quadro = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(quadro);
      lenis.destroy();
    };
  }, []);
  return null;
}
