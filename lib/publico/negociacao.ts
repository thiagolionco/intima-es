/**
 * Negociação de conteúdo (Accept) para as páginas públicas: agentes que pedem text/markdown
 * recebem Markdown; navegadores continuam recebendo HTML.
 */

function qualidades(accept: string): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const parte of accept.split(",")) {
    const [tipo, ...params] = parte.trim().toLowerCase().split(";");
    if (!tipo) continue;
    let q = 1;
    for (const p of params) {
      const [k, v] = p.trim().split("=");
      if (k === "q") q = Number.isFinite(Number(v)) ? Number(v) : 0;
    }
    mapa.set(tipo.trim(), Math.max(mapa.get(tipo.trim()) ?? 0, q));
  }
  return mapa;
}

/**
 * Markdown só quando text/markdown é pedido explicitamente e com preferência igual ou maior
 * que text/html. Curingas (text/qualquer, qualquer/qualquer) não contam, porque o navegador sempre manda um.
 */
export function prefereMarkdown(accept: string | null | undefined): boolean {
  if (!accept) return false;
  const q = qualidades(accept);
  const md = Math.max(q.get("text/markdown") ?? 0, q.get("text/x-markdown") ?? 0);
  if (md <= 0) return false;
  return md >= (q.get("text/html") ?? 0);
}
