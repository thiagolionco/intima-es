/** Descrição amigável de um user-agent ("Chrome no Windows"). Heurística simples, sem dependências. */
export interface Dispositivo {
  navegador: string;
  sistema: string;
  movel: boolean;
}

export function descreverDispositivo(ua: string): Dispositivo {
  const navegador = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : /node|undici|curl/i.test(ua)
              ? "Cliente de API"
              : "Navegador desconhecido";
  const sistema = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Android/.test(ua)
          ? "Android"
          : /Linux/.test(ua)
            ? "Linux"
            : "sistema desconhecido";
  return { navegador, sistema, movel: /Mobile|Android|iPhone|iPad/.test(ua) };
}

export function rotuloDispositivo(ua: string): string {
  const d = descreverDispositivo(ua);
  return `${d.navegador} no ${d.sistema}`;
}
