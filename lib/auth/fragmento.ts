/**
 * Lê o token do fragmento (#token=…) e o remove da barra de endereços. O fragmento nunca é
 * enviado ao servidor nem vaza no cabeçalho Referer, o que protege links de uso único.
 */
export function lerTokenDoFragmento(): string {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
  if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
  return token;
}
