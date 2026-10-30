"use client";

import clsx from "clsx";
import { useEffect, useRef } from "react";

// A animação (estrela "AI Spark", do LottieFiles) e o tocador só são baixados na primeira espera pela IA.
let carga: Promise<[typeof import("lottie-web/build/player/lottie_light").default, unknown]> | null = null;
function carregar() {
  carga ??= Promise.all([
    import("lottie-web/build/player/lottie_light").then((m) => m.default),
    import("./ia-pensando.json").then((m) => m.default),
  ]);
  return carga;
}

/** A estrela da IA se mexendo. Usada em toda espera por uma resposta da IA. Com menos movimento, fica parada. */
export function IaAnimacao({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let animacao: { destroy(): void } | null = null;
    let ativo = true;
    carregar()
      .then(([lottie, dados]) => {
        if (!ativo || !ref.current) return;
        const calmo = matchMedia("(prefers-reduced-motion: reduce)").matches;
        animacao = lottie.loadAnimation({ container: ref.current, renderer: "svg", loop: !calmo, autoplay: !calmo, animationData: dados });
      })
      .catch(() => {
        carga = null;
      });
    return () => {
      ativo = false;
      animacao?.destroy();
    };
  }, []);

  return <span ref={ref} className={clsx("inline-block shrink-0", className)} aria-hidden />;
}

/** Bloco de espera pela IA, no lugar do Spinner. */
export function IaPensando({ label, compacto }: { label: string; compacto?: boolean }) {
  return (
    <div className={clsx("flex items-center gap-2 text-sm text-slate-500", compacto ? "" : "justify-center py-12")} role="status">
      <IaAnimacao className={compacto ? "h-8 w-8" : "h-16 w-16"} />
      {label}
    </div>
  );
}
