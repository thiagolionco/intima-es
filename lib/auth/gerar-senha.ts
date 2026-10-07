/** Gera uma senha forte no navegador (Web Crypto), garantindo todas as classes de caractere. */
export function gerarSenhaForte(tamanho = 18): string {
  const grupos = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%&*?-_+="];
  const todos = grupos.join("");
  const aleatorio = (n: number) => {
    const buf = new Uint32Array(1);
    // Rejeição para evitar viés de módulo.
    const limite = Math.floor(0xffffffff / n) * n;
    do crypto.getRandomValues(buf);
    while (buf[0] >= limite);
    return buf[0] % n;
  };
  const chars = grupos.map((g) => g[aleatorio(g.length)]);
  while (chars.length < tamanho) chars.push(todos[aleatorio(todos.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
