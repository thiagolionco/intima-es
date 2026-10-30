"use client";

import { useEffect, useRef } from "react";

/** Evento que a gota dispara ao tocar a água, para as letras acenderem junto com a onda. */
export const EVENTO_ONDA = "clepsa:onda";
export type DetalheOnda = { x: number; y: number; raio: number; razao: number; vida: number };

// Letras, números e os sinais do texto jurídico (§, ¶, nº). Sem acentos para caber igual na grade.
const SINAIS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789§§¶º/.:;-".split("");
const CELULA_L = 14, CELULA_A = 20, RAIO_CURSOR = 110, MEIA_VIDA = 0.55;

/**
 * Fundo de letras das telas de acesso: uma grade invisível de caracteres que aparece em volta
 * do cursor (ou do dedo, no celular) e se apaga devagar, trocando de letra enquanto some.
 * A onda da gota também acende as letras por onde passa. Só desenha enquanto há letra acesa;
 * com movimento reduzido não aparece. Atrás do texto da página fica bem mais fraco, para não atrapalhar a leitura.
 */
export function CampoDeLetras({ atenuarIds = [] }: { atenuarIds?: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let W = 0, H = 0, cols = 0, linhas = 0, quadroId = 0, ultimo = 0;
    let brilho = new Float32Array(0);
    let letra = new Uint8Array(0);
    let sobTexto = new Uint8Array(0);
    const acesas = new Set<number>();
    const ondas: (DetalheOnda & { t0: number })[] = [];
    const sorteia = () => (Math.random() * SINAIS.length) | 0;

    function medir() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth;
      H = innerHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.font = `500 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx!.textAlign = "center";
      ctx!.textBaseline = "middle";
      cols = Math.ceil(W / CELULA_L);
      linhas = Math.ceil(H / CELULA_A);
      brilho = new Float32Array(cols * linhas);
      letra = Uint8Array.from({ length: cols * linhas }, sorteia);
      acesas.clear();
      sobTexto = new Uint8Array(cols * linhas);
      const blocos = atenuarIds.flatMap((id) => Array.from(document.getElementById(id)?.children ?? []));
      for (const el of blocos) {
        const r = el.getBoundingClientRect();
        for (let l = Math.max(0, Math.floor(r.top / CELULA_A)); l <= Math.min(linhas - 1, Math.floor(r.bottom / CELULA_A)); l++)
          for (let c = Math.max(0, Math.floor(r.left / CELULA_L)); c <= Math.min(cols - 1, Math.floor(r.right / CELULA_L)); c++) sobTexto[l * cols + c] = 1;
      }
    }

    function acende(i: number, valor: number) {
      if (valor <= brilho[i]) return;
      if (brilho[i] < 0.05) letra[i] = sorteia();
      brilho[i] = Math.min(1, valor);
      acesas.add(i);
    }

    function emVolta(x: number, y: number, raio: number, forca: number) {
      const c0 = Math.max(0, Math.floor((x - raio) / CELULA_L)), c1 = Math.min(cols - 1, Math.floor((x + raio) / CELULA_L));
      const l0 = Math.max(0, Math.floor((y - raio) / CELULA_A)), l1 = Math.min(linhas - 1, Math.floor((y + raio) / CELULA_A));
      for (let l = l0; l <= l1; l++) {
        for (let c = c0; c <= c1; c++) {
          const d = Math.hypot((c + 0.5) * CELULA_L - x, (l + 0.5) * CELULA_A - y) / raio;
          // Borda irregular: nem toda letra do círculo acende, como no papel granulado.
          if (d < 1 && Math.random() < 0.75) acende(l * cols + c, forca * (1 - d * d));
        }
      }
    }

    function pelaOnda(agora: number) {
      for (let k = ondas.length - 1; k >= 0; k--) {
        const o = ondas[k];
        const u = (agora - o.t0) / 1000 / o.vida;
        if (u >= 1) {
          ondas.splice(k, 1);
          continue;
        }
        // Mesma curva da onda da gota (sai cúbico), só no primeiro anel e com intensidade menor.
        const r = (1 - Math.pow(1 - u, 3)) * o.raio;
        const forca = 0.5 * Math.pow(1 - u, 1.6);
        const passos = Math.max(24, Math.ceil((2 * Math.PI * r) / CELULA_L));
        for (let p = 0; p < passos; p++) {
          if (Math.random() > 0.35) continue;
          const ang = (p / passos) * Math.PI * 2;
          const c = Math.floor((o.x + Math.cos(ang) * r) / CELULA_L);
          const l = Math.floor((o.y + Math.sin(ang) * r * o.razao) / CELULA_A);
          if (c >= 0 && c < cols && l >= 0 && l < linhas) acende(l * cols + c, forca);
        }
      }
    }

    function quadro(agora: number) {
      const dt = Math.min(0.1, (agora - (ultimo || agora)) / 1000);
      ultimo = agora;
      pelaOnda(agora);
      ctx!.clearRect(0, 0, W, H);
      const queda = Math.pow(0.5, dt / MEIA_VIDA);
      for (const i of acesas) {
        const b0 = (brilho[i] *= queda);
        if (b0 < 0.03) {
          brilho[i] = 0;
          acesas.delete(i);
          continue;
        }
        const b = sobTexto[i] ? b0 * 0.3 : b0;
        // Enquanto some, a letra ainda troca de vez em quando.
        if (Math.random() < 0.06) letra[i] = sorteia();
        const x = ((i % cols) + 0.5) * CELULA_L, y = (((i / cols) | 0) + 0.5) * CELULA_A;
        // Do azul da marca (brand-400) ao quase branco (brand-100) no centro.
        ctx!.fillStyle = b > 0.7 ? `rgba(219,231,255,${b * 0.8})` : `rgba(144,182,255,${b * 0.7})`;
        ctx!.fillText(SINAIS[letra[i]], x, y);
      }
      quadroId = acesas.size || ondas.length ? requestAnimationFrame(quadro) : 0;
      if (!quadroId) ultimo = 0;
    }

    const anima = () => {
      if (!quadroId) quadroId = requestAnimationFrame(quadro);
    };
    const mexeu = (e: PointerEvent) => {
      emVolta(e.clientX, e.clientY, e.pointerType === "mouse" ? RAIO_CURSOR : RAIO_CURSOR * 0.8, 0.9);
      anima();
    };
    const onda = (e: Event) => {
      ondas.push({ ...(e as CustomEvent<DetalheOnda>).detail, t0: performance.now() });
      anima();
    };

    medir();
    addEventListener("resize", medir);
    document.fonts?.ready.then(medir);
    addEventListener("pointermove", mexeu, { passive: true });
    addEventListener(EVENTO_ONDA, onda);
    return () => {
      removeEventListener("resize", medir);
      removeEventListener("pointermove", mexeu);
      removeEventListener(EVENTO_ONDA, onda);
      cancelAnimationFrame(quadroId);
    };
  }, [atenuarIds.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 -z-10 h-screen w-screen" aria-hidden />;
}
