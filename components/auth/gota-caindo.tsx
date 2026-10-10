"use client";

import { useEffect, useRef } from "react";

/**
 * Fundo animado das telas de acesso: uma gota nasce no alto, cai no vão entre o texto e o cartão,
 * respinga e abre ondas; os pontos do fundo acendem quando a onda passa por eles.
 * Só no desktop (no celular o cartão vem primeiro e a cena atrapalharia). Com movimento reduzido,
 * desenha um quadro parado logo depois do impacto.
 */
export function GotaCaindo({ textoId, cartaoId }: { textoId: string; cartaoId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const calmo = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const CICLO = 7, BROTO = 0.8, QUEDA = 1.25, VIDA = 3.6, ANEIS = 4, RAZAO = 0.24;
    const tImp = BROTO + QUEDA;

    let W = 0, H = 0, ix = 0, iy = 0, escala = 1, raio = 400, ativo = false, quadroId = 0;
    const t0 = performance.now();
    const estrelas = Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.random(), b: 0.08 + Math.random() * 0.32, g: Math.random() < 0.08 }));

    const sai = (u: number) => 1 - Math.pow(1 - u, 3);
    const suave = (u: number) => u * u * (3 - 2 * u);
    // Tons da marca: brand-300 (#90b6ff) e brand-400 (#5c8dfd).
    const claro = (a: number) => `rgba(144,182,255,${a})`;
    const marca = (a: number) => `rgba(92,141,253,${a})`;

    function medir() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth;
      H = innerHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const texto = document.getElementById(textoId);
      const cartao = document.getElementById(cartaoId);
      ativo = W >= 1024 && !!texto && !!cartao;
      if (!ativo) {
        ctx!.clearRect(0, 0, W, H);
        return;
      }
      escala = Math.max(0.8, Math.min(1.2, W / 1280));
      // Direita do texto = a maior borda direita entre os blocos de texto, que têm largura própria.
      const direita = Math.max(...Array.from(texto!.children, (el) => el.getBoundingClientRect().right));
      const c = cartao!.getBoundingClientRect();
      ix = c.left - direita < 48 ? c.left - 24 : (direita + c.left) / 2;
      iy = Math.min(H * 0.64, c.bottom - 40);
      raio = Math.max(W, H) * 0.6;
      if (calmo) desenhar(tImp + 0.9);
    }

    function gota(x: number, y: number, s: number, estica: number) {
      const g = ctx!.createLinearGradient(x, y - 1.7 * s, x, y + 1.2 * s);
      g.addColorStop(0, "#90b6ff");
      g.addColorStop(1, "#2147ed");
      const h = 1.7 * s * estica;
      ctx!.beginPath();
      ctx!.moveTo(x, y - h);
      ctx!.bezierCurveTo(x + 0.15 * s, y - 1.0 * s, x + s, y - 0.55 * s, x + s, y + 0.2 * s);
      ctx!.arc(x, y + 0.2 * s, s, 0, Math.PI);
      ctx!.bezierCurveTo(x - s, y - 0.55 * s, x - 0.15 * s, y - 1.0 * s, x, y - h);
      ctx!.fillStyle = g;
      ctx!.shadowColor = "rgba(92,141,253,.45)";
      ctx!.shadowBlur = 12;
      ctx!.fill();
      ctx!.shadowBlur = 0;
      ctx!.beginPath();
      ctx!.ellipse(x - s * 0.36, y + 0.05 * s, s * 0.13, s * 0.3, 0.25, 0, Math.PI * 2);
      ctx!.fillStyle = "rgba(255,255,255,.45)";
      ctx!.fill();
    }

    function desenhar(t: number) {
      ctx!.clearRect(0, 0, W, H);
      const s = 10 * escala;
      const apos = t - tImp;

      const ondas: { r: number; a: number }[] = [];
      for (let k = 0; k < ANEIS; k++) {
        const idade = t - (tImp + k * 0.34);
        if (idade > 0 && idade < VIDA) {
          const u = idade / VIDA;
          ondas.push({ r: sai(u) * raio, a: Math.pow(1 - u, 1.6) * (1 - k * 0.14) });
        }
      }

      // Pontos do fundo: discretos, acendem quando a onda passa.
      for (const p of estrelas) {
        const px = p.x * W, py = p.y * H;
        const d = Math.hypot(px - ix, (py - iy) / RAZAO);
        let brilho = 0;
        for (const o of ondas) brilho += Math.exp(-Math.pow((d - o.r) / 26, 2)) * o.a;
        ctx!.fillStyle = `rgba(215,225,255,${Math.min(1, p.b * 0.5 + brilho)})`;
        const tam = (p.g ? 1.6 : 1) + Math.min(1.2, brilho * 1.4);
        ctx!.fillRect(px, py, tam, tam);
      }

      for (const o of ondas) {
        ctx!.beginPath();
        ctx!.ellipse(ix, iy, o.r, o.r * RAZAO, 0, 0, Math.PI * 2);
        ctx!.strokeStyle = marca(0.6 * o.a);
        ctx!.lineWidth = 0.8 + 1.8 * o.a;
        ctx!.stroke();
      }

      // Nasce no alto, cai com um rastro fino e respinga ao tocar a água.
      if (t < BROTO) {
        const u = t / BROTO;
        gota(ix, 6 + 10 * u, s * (0.25 + 0.75 * suave(u)), 0.6 + 0.4 * u);
      } else if (t < tImp) {
        const u = (t - BROTO) / QUEDA;
        const y = 16 + (iy - 16 - 1.2 * s) * u * u;
        const rastro = ctx!.createLinearGradient(0, y - 120 * escala, 0, y - 2 * s);
        rastro.addColorStop(0, marca(0));
        rastro.addColorStop(1, marca(0.25));
        ctx!.fillStyle = rastro;
        ctx!.fillRect(ix - 0.75, y - 120 * escala, 1.5, 120 * escala - 2 * s);
        gota(ix, y, s, 1 + 0.35 * u);
      }
      if (apos > 0 && apos < 0.9) {
        const u = apos / 0.9, r = 26 * u * escala + 4;
        ctx!.beginPath();
        ctx!.ellipse(ix, iy, r, r * RAZAO, 0, 0, Math.PI * 2);
        ctx!.fillStyle = claro(0.5 * (1 - u));
        ctx!.fill();
        for (let i = 0; i < 6; i++) {
          const dir = (i - 2.5) / 2.5;
          const x = ix + dir * 70 * escala * apos;
          const y = iy - (110 + (i % 3) * 30) * escala * apos + 380 * escala * apos * apos;
          ctx!.beginPath();
          ctx!.arc(x, y, (2.2 - u * 1.3) * escala, 0, Math.PI * 2);
          ctx!.fillStyle = claro(0.85 * (1 - u));
          ctx!.fill();
        }
      }
    }

    function quadro(agora: number) {
      if (ativo) desenhar((Math.max(0, agora - t0) / 1000) % CICLO);
      quadroId = requestAnimationFrame(quadro);
    }

    medir();
    addEventListener("resize", medir);
    document.fonts?.ready.then(medir);
    if (!calmo) quadroId = requestAnimationFrame(quadro);
    return () => {
      removeEventListener("resize", medir);
      cancelAnimationFrame(quadroId);
    };
  }, [textoId, cartaoId]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0 -z-10 h-screen w-screen" aria-hidden />;
}
