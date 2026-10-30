"use client";

import clsx from "clsx";
import { useEffect, useRef } from "react";

const GOTA = "M16 3.5c1.6 3.4 5 5.6 5 9.1a5 5 0 0 1-10 0c0-3.5 3.4-5.7 5-9.1Z";
const CICLO = 2.6; // segundos de um ciclo completo
const BASE_GOTA = 17.6; // ponto mais baixo da gota em repouso
const QUEDA = 7.4; // até a superfície da água (y = 25)
const RESPINGOS = [
  { vx: -11, vy: 26, r: 0.75 },
  { vx: -5, vy: 34, r: 0.95 },
  { vx: 6, vy: 31, r: 0.85 },
  { vx: 12, vy: 23, r: 0.65 },
];

const limitar = (x: number) => Math.max(0, Math.min(1, x));
const fase = (t: number, a: number, b: number) => limitar((t - a) / (b - a));
const sai = (u: number) => 1 - Math.pow(1 - u, 3);
const volta = (u: number) => 1 + 2.9 * Math.pow(u - 1, 3) + 1.9 * Math.pow(u - 1, 2);
const mola = (x: number) => (x <= 0 ? 0 : Math.exp(-x * 7) * Math.sin(x * 22));

type Partes = { gota: SVGPathElement; interna: SVGEllipseElement; externa: SVGEllipseElement; onda: SVGEllipseElement; respingos: SVGCircleElement[] };

/** Desenha o instante t (0..CICLO). Em 0 e em CICLO o desenho é idêntico ao símbolo parado. */
function quadro(p: Partes, t: number) {
  let tf = "";
  let op = 1;
  if (t >= 0.3 && t < 0.5) {
    // A gota pesa e se alonga, presa no alto.
    const u = sai(fase(t, 0.3, 0.5));
    tf = `translate(16 3.5) scale(${1 - 0.06 * u} ${1 + 0.1 * u}) translate(-16 -3.5)`;
  } else if (t >= 0.5 && t < 0.85) {
    // Queda com aceleração.
    const u = fase(t, 0.5, 0.85);
    tf = `translate(0 ${QUEDA * u * u}) translate(16 ${BASE_GOTA}) scale(${0.94 - 0.06 * u} ${1.1 + 0.1 * u}) translate(-16 ${-BASE_GOTA})`;
  } else if (t >= 0.85 && t < 0.95) {
    // Impacto: achata e some na água.
    const u = sai(fase(t, 0.85, 0.95));
    tf = `translate(0 ${QUEDA}) translate(16 ${BASE_GOTA}) scale(${0.88 + 0.6 * u} ${1.2 - 0.95 * u}) translate(-16 ${-BASE_GOTA})`;
    op = 1 - u;
  } else if (t >= 0.95 && t < 1.45) {
    op = 0;
  } else if (t >= 1.45 && t < 2.15) {
    // Uma gota nova se forma no alto.
    const u = fase(t, 1.45, 2.15);
    tf = `translate(16 12) scale(${Math.max(0.001, volta(u))}) translate(-16 -12)`;
    op = Math.min(1, u * 3);
  }
  p.gota.setAttribute("transform", tf);
  p.gota.setAttribute("opacity", String(op));

  // As duas ondas da marca balançam com o impacto, a de fora um pouco depois.
  const ki = mola(t - 0.86);
  const ke = mola(t - 0.93);
  p.interna.setAttribute("rx", String(6.5 * (1 + 0.12 * ki)));
  p.interna.setAttribute("ry", String(2 * (1 - 0.35 * ki)));
  p.externa.setAttribute("rx", String(13 * (1 + 0.06 * ke)));
  p.externa.setAttribute("ry", String(4.2 * (1 - 0.22 * ke)));

  // Uma onda nova nasce no centro e passa além das duas.
  const uo = fase(t, 0.86, 1.9);
  if (uo > 0 && uo < 1) {
    const e = sai(uo);
    p.onda.setAttribute("rx", String(1 + 15.5 * e));
    p.onda.setAttribute("ry", String(0.35 + 4.8 * e));
    p.onda.setAttribute("opacity", String(0.9 * (1 - uo)));
    p.onda.setAttribute("stroke-width", String(1.6 - uo));
  } else p.onda.setAttribute("opacity", "0");

  // Respingos: arcos curtos que sobem e caem.
  const s = t - 0.86;
  p.respingos.forEach((c, i) => {
    const d = RESPINGOS[i];
    if (s > 0 && s < 0.5) {
      c.setAttribute("cx", String(16 + d.vx * s));
      c.setAttribute("cy", String(24.5 - d.vy * s + 75 * s * s));
      c.setAttribute("opacity", String(1 - s / 0.5));
    } else c.setAttribute("opacity", "0");
  });
}

/**
 * Símbolo da Clepsa com a gota caindo na água.
 * "uma": toca ao aparecer e de novo quando o mouse passa pelo link ou bloco em volta; "hover": só ao passar o mouse;
 * "loop": sem parar (para esperas). Quem pede menos movimento vê o símbolo parado.
 */
export function ClepsaSimboloAnimado({ className, modo = "uma" }: { className?: string; modo?: "uma" | "hover" | "loop" }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const p: Partes = {
      gota: svg.querySelector("[data-gota]")!,
      interna: svg.querySelector("[data-interna]")!,
      externa: svg.querySelector("[data-externa]")!,
      onda: svg.querySelector("[data-onda]")!,
      respingos: Array.from(svg.querySelectorAll("[data-respingo]")),
    };
    let t = 0;
    let tocando = modo !== "hover";
    let antes = performance.now();
    let id = 0;

    const passo = (agora: number) => {
      t += Math.min(0.05, (agora - antes) / 1000);
      antes = agora;
      if (t >= CICLO) {
        if (modo === "loop") t -= CICLO;
        else {
          t = 0;
          tocando = false;
        }
      }
      quadro(p, t);
      id = tocando ? requestAnimationFrame(passo) : 0;
    };
    const tocar = () => {
      if (tocando) return;
      tocando = true;
      t = 0;
      antes = performance.now();
      id = requestAnimationFrame(passo);
    };
    if (tocando) id = requestAnimationFrame(passo);

    const gatilho = modo === "loop" ? null : (svg.closest("a, [data-gatilho-gota]") ?? svg.parentElement);
    gatilho?.addEventListener("mouseenter", tocar);
    return () => {
      cancelAnimationFrame(id);
      gatilho?.removeEventListener("mouseenter", tocar);
    };
  }, [modo]);

  return (
    <svg ref={ref} viewBox="0 0 32 32" className={clsx("shrink-0 overflow-visible", className)} aria-hidden focusable="false">
      <ellipse data-onda cx="16" cy="25" rx="1" ry="0.35" fill="none" stroke="#5c8dfd" strokeWidth="1.4" opacity="0" />
      <ellipse data-interna cx="16" cy="25" rx="6.5" ry="2" fill="none" stroke="#5c8dfd" strokeWidth="1.8" />
      <ellipse data-externa cx="16" cy="25" rx="13" ry="4.2" fill="none" stroke="#5c8dfd" strokeOpacity=".55" strokeWidth="1.8" />
      {RESPINGOS.map((d, i) => (
        <circle key={i} data-respingo cx="16" cy="25" r={d.r} fill="#5c8dfd" opacity="0" />
      ))}
      <path data-gota d={GOTA} fill="#5c8dfd" />
    </svg>
  );
}
