"use client";

import { useEffect, useRef } from "react";

/**
 * Fundo animado das telas de acesso: milhares de pontos (intimações) surgem num mar escuro;
 * os que caem perto da corrente são puxados por ela e desaguam no cartão de acesso (`alvoId`).
 */
export function OceanoIntimacoes({ alvoId }: { alvoId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const alvo = document.getElementById(alvoId);
    if (!canvas || !ctx || !alvo) return;
    const calmo = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0, H = 0;
    let xe = 0, y0 = 0, ye = 0, campo = 60, vertical = false;
    let pulso = 0;

    function medir() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const base = canvas!.getBoundingClientRect();
      const c = alvo!.getBoundingClientRect();
      W = base.width; H = base.height;
      canvas!.width = W * dpr; canvas!.height = H * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      vertical = W < 1024;
      if (vertical) {
        // Em telas estreitas a corrente desce até o topo do cartão.
        xe = c.top - base.top; y0 = W * 0.5; ye = c.left - base.left + c.width / 2;
      } else {
        xe = c.left - base.left; y0 = H * 0.62; ye = c.top - base.top + c.height / 2;
      }
      campo = Math.max(42, Math.min(W, H) * 0.075);
      ctx!.fillStyle = "#04070f";
      ctx!.fillRect(0, 0, W, H);
    }

    const suave = (u: number) => u * u * (3 - 2 * u);
    const rio = (a: number, t: number) => {
      const u = Math.max(0, Math.min(1, a / (xe || 1)));
      return y0 + (ye - y0) * suave(u) + Math.sin(u * 7 + t * 0.00045) * (1 - u) * campo * 1.6;
    };
    // Coordenadas "ao longo do rio, ao lado do rio" ↔ tela.
    const tela = (a: number, b: number) => (vertical ? [b, a] : [a, b]);

    type Ponto = { x: number; y: number; a: number; b: number; vida: number; dur: number; tam: number; brilho: number; preso: boolean; faixa: number; vel: number; dx: number; dy: number };
    const pontos: Ponto[] = [];
    const MAX = 3200;

    function nascer(t: number) {
      const x = Math.random() * W, y = Math.random() * H;
      const [a, b] = vertical ? [y, x] : [x, y];
      const p: Ponto = { x, y, a, b, vida: 0, dur: 1800 + Math.random() * 4200, tam: Math.random() < 0.06 ? 1.8 : 1 + Math.random() * 0.6, brilho: 0.25 + Math.random() * 0.55, preso: false, faixa: 0, vel: 0, dx: (Math.random() - 0.5) * 0.04, dy: (Math.random() - 0.5) * 0.04 };
      // Entrou no campo do produto: é puxada para a corrente.
      if (a < xe - 20 && Math.abs(b - rio(a, t)) < campo) {
        p.preso = true;
        p.faixa = Math.round(((b - rio(a, t)) / campo) * 3);
        p.vel = 0.9 + Math.random() * 0.6;
      }
      pontos.push(p);
    }

    let ultimo = 0;
    function passo(t: number) {
      const dt = Math.min(50, t - ultimo);
      ultimo = t;
      const c = ctx!;

      c.globalCompositeOperation = "source-over";
      c.fillStyle = "rgba(4,7,15,0.2)";
      c.fillRect(0, 0, W, H);

      c.globalCompositeOperation = "lighter";
      c.beginPath();
      for (let a = 0; a <= xe; a += 8) {
        const [x, y] = tela(a, rio(a, t));
        if (a === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.lineCap = "round";
      c.strokeStyle = "rgba(33,71,237,0.022)";
      c.lineWidth = campo * 1.4;
      c.stroke();
      c.strokeStyle = "rgba(144,182,255,0.035)";
      c.lineWidth = 2;
      c.stroke();

      const nascem = Math.round(((W * H) / 26000) * (dt / 16));
      for (let i = 0; i < nascem && pontos.length < MAX; i++) nascer(t);

      for (let i = pontos.length - 1; i >= 0; i--) {
        const p = pontos[i];
        p.vida += dt;
        if (!p.preso) {
          const k = p.vida / p.dur;
          if (k >= 1) { pontos.splice(i, 1); continue; }
          p.x += p.dx * dt; p.y += p.dy * dt;
          c.fillStyle = `rgba(150,170,230,${Math.sin(Math.PI * k) * p.brilho * 0.55})`;
          c.fillRect(p.x, p.y, p.tam, p.tam);
          continue;
        }
        // Na corrente: acelera e se alinha em faixas cada vez mais estreitas.
        const u = Math.max(0, Math.min(1, p.a / (xe || 1)));
        p.vel = Math.min(p.vel + 0.0025 * dt, 2.6 + u * 2.2);
        p.a += p.vel * dt * 0.12;
        p.b += (rio(p.a, t) + p.faixa * 5 * (1 - u * 0.75) - p.b) * Math.min(1, 0.006 * dt);
        if (p.a >= xe - 2) {
          pontos.splice(i, 1);
          pulso = Math.min(1, pulso + 0.035);
          continue;
        }
        const [x, y] = tela(p.a, p.b);
        const entrada = Math.min(1, p.vida / 500);
        c.fillStyle = `rgba(144,182,255,${0.55 * entrada})`;
        c.fillRect(x - 0.5, y - 0.5, 2, 2);
        c.fillStyle = `rgba(235,242,255,${0.8 * entrada * u})`;
        c.fillRect(x, y, 1, 1);
      }

      // O cartão acende de leve quando recebe a corrente.
      pulso *= Math.pow(0.985, dt / 16);
      alvo!.style.boxShadow = `0 0 0 1px rgba(144,182,255,${0.25 + pulso * 0.5}), 0 30px 80px -20px rgba(33,71,237,${0.45 + pulso * 0.4}), 0 0 ${30 + pulso * 60}px rgba(144,182,255,${pulso * 0.35})`;
    }

    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(canvas);
    observador.observe(alvo);

    // Começa com o mar já cheio; sem movimento, fica só esse instante parado.
    const agora = performance.now(), passos = calmo ? 160 : 90;
    ultimo = agora - (passos + 1) * 16;
    for (let n = 0; n < passos; n++) passo(agora - (passos - n) * 16);
    ultimo = performance.now();

    let quadro = 0;
    const animar = (t: number) => { passo(t); quadro = requestAnimationFrame(animar); };
    if (!calmo) quadro = requestAnimationFrame(animar);

    return () => {
      cancelAnimationFrame(quadro);
      observador.disconnect();
      alvo.style.boxShadow = "";
    };
  }, [alvoId]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 -z-10 block h-full w-full" aria-hidden />;
}
