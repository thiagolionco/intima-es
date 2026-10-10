/**
 * Elemento decorativo das telas de acesso: uma gota cai devagar e abre ondas concêntricas.
 * Fica acima da headline, alinhado à esquerda com o texto. Só CSS; com movimento reduzido, fica parado.
 */
export function GotaOndas({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 128" className={className} aria-hidden focusable="false">
      {/* Ondas paradas: dão forma à composição mesmo sem animação. */}
      <g fill="none" stroke="#5c8dfd">
        <ellipse cx="100" cy="104" rx="30" ry="8" strokeOpacity=".7" strokeWidth="2" />
        <ellipse cx="100" cy="104" rx="62" ry="16" strokeOpacity=".32" strokeWidth="1.5" />
        <ellipse cx="100" cy="104" rx="96" ry="22" strokeOpacity=".12" strokeWidth="1.25" />
      </g>
      {/* Ondas que se abrem a cada queda. */}
      <g fill="none" stroke="#90b6ff" strokeWidth="1.5">
        <ellipse className="clepsa-onda" cx="100" cy="104" rx="96" ry="22" />
        <ellipse className="clepsa-onda clepsa-onda-2" cx="100" cy="104" rx="96" ry="22" />
      </g>
      <path className="clepsa-gota" d="M100 4c2.6 5.4 8 9 8 14.6a8 8 0 0 1-16 0c0-5.6 5.4-9.2 8-14.6Z" fill="#5c8dfd" />
    </svg>
  );
}
