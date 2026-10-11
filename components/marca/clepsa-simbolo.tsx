import clsx from "clsx";

/**
 * Símbolo da Clepsa: uma gota sobre duas ondas concêntricas.
 * Formas chapadas e poucas, para continuar legível em 16px (favicon) e em avatares.
 */
export function ClepsaSimbolo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx("shrink-0", className)} aria-hidden focusable="false">
      <path d="M16 3.5c1.6 3.4 5 5.6 5 9.1a5 5 0 0 1-10 0c0-3.5 3.4-5.7 5-9.1Z" fill="#5c8dfd" />
      <ellipse cx="16" cy="25" rx="6.5" ry="2" fill="none" stroke="#5c8dfd" strokeWidth="1.8" />
      <ellipse cx="16" cy="25" rx="13" ry="4.2" fill="none" stroke="#5c8dfd" strokeOpacity=".55" strokeWidth="1.8" />
    </svg>
  );
}

/** Marca completa (símbolo + nome), usada no topo das telas de acesso e na barra lateral. */
export function ClepsaMarca({ legenda, className }: { legenda?: string; className?: string }) {
  return (
    <span className={clsx("flex items-center gap-3", className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0b1736] ring-1 ring-inset ring-white/10">
        <ClepsaSimbolo className="h-7 w-7" />
      </span>
      <span className="leading-tight">
        <span className="block text-[17px] font-semibold tracking-tight text-white">Clepsa</span>
        {legenda && <span className="block text-[13px] text-slate-400">{legenda}</span>}
      </span>
    </span>
  );
}
