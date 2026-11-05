/**
 * Leitura de feeds RSS 2.0 e Atom sem dependências. Só o que a aba News precisa:
 * título, link, data e um resumo curto em texto puro.
 */

export interface ItemFeed {
  titulo: string;
  link: string;
  /** ISO 8601, quando a data do feed pôde ser lida. */
  data?: string;
  resumo?: string;
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ordm: "º", ordf: "ª", sect: "§", ndash: "–", mdash: "—", hellip: "…" };

export function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (todo, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTIDADES[e.toLowerCase()] ?? todo;
  });
}

/** Texto puro: tira CDATA, tags HTML e espaços repetidos. */
export function textoPuro(bruto: string): string {
  const semCdata = bruto.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // Duas passagens: o conteúdo pode vir com HTML escapado (&lt;p&gt;).
  const html = decodificarEntidades(semCdata.replace(/<[^>]*>/g, " "));
  return decodificarEntidades(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function campo(bloco: string, nome: string): string | undefined {
  const m = bloco.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, "i"));
  return m ? m[1] : undefined;
}

const MESES: Record<string, number> = {
  jan: 0, feb: 1, fev: 1, mar: 2, apr: 3, abr: 3, may: 4, mai: 4, jun: 5, jul: 6, aug: 7, ago: 7, sep: 8, set: 8, oct: 9, out: 9, nov: 10, dec: 11, dez: 11,
};

/**
 * Datas que os feeds oficiais usam: RFC 822 ("Wed, 04 Nov 2026 17:59:36 +0000"), ISO 8601
 * ("2026-11-05T00:06:37Z", do Senado) e o formato do STJ em português ("Qui, nov 5 2026 06:00:00",
 * horário de Brasília). Devolve ISO ou undefined.
 */
export function lerData(bruta: string | undefined): string | undefined {
  if (!bruta) return undefined;
  const s = textoPuro(bruta);
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(/T\d{2}:\d{2}/.test(s) || s.length === 10 ? s : s.replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  // "dd mmm yyyy hh:mm[:ss] [zona]" (RFC 822)
  let m = s.match(/(\d{1,2})\s+([a-zç]{3})[a-z]*\.?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*([+-]\d{4}|GMT|UTC|UT|Z)?/i);
  let dia: number, mes: number | undefined, ano: number, h = 0, min = 0, seg = 0, zona: string | undefined;
  if (m) {
    [dia, mes, ano] = [Number(m[1]), MESES[m[2].toLowerCase()], Number(m[3])];
    [h, min, seg, zona] = [Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0), m[7]];
  } else {
    // "mmm d yyyy hh:mm:ss" (STJ)
    m = s.match(/([a-zç]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i);
    if (!m) return undefined;
    [mes, dia, ano] = [MESES[m[1].toLowerCase()], Number(m[2]), Number(m[3])];
    [h, min, seg] = [Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)];
    zona = "-0300";
  }
  if (mes === undefined) return undefined;
  let desvio = -180; // sem zona: horário de Brasília
  if (zona && /^[+-]\d{4}$/.test(zona)) desvio = (zona[0] === "-" ? -1 : 1) * (Number(zona.slice(1, 3)) * 60 + Number(zona.slice(3)));
  else if (zona) desvio = 0;
  const ms = Date.UTC(ano, mes, dia, h, min, seg) - desvio * 60_000;
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

function linkSeguro(bruto: string | undefined): string | undefined {
  if (!bruto) return undefined;
  const s = textoPuro(bruto);
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function resumir(bruto: string | undefined, max = 280): string | undefined {
  if (!bruto) return undefined;
  const t = textoPuro(bruto);
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, "")}…` : t;
}

/** Lê um feed RSS 2.0 ou Atom. Itens sem título ou sem link são descartados. */
export function lerFeed(xml: string, limite = 15): ItemFeed[] {
  const atom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocos = xml.match(atom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const itens: ItemFeed[] = [];
  for (const b of blocos) {
    const titulo = textoPuro(campo(b, "title") ?? "");
    let link: string | undefined;
    if (atom) {
      const alt = b.match(/<link\b[^>]*rel=["']alternate["'][^>]*>/i)?.[0] ?? b.match(/<link\b[^>]*>/i)?.[0];
      link = linkSeguro(alt?.match(/href=["']([^"']+)["']/i)?.[1]);
    } else {
      link = linkSeguro(campo(b, "link")) ?? linkSeguro(campo(b, "guid"));
    }
    if (!titulo || !link) continue;
    const data = atom ? lerData(campo(b, "published") ?? campo(b, "updated")) : lerData(campo(b, "pubDate") ?? campo(b, "dc:date"));
    const resumo = resumir(atom ? campo(b, "summary") ?? campo(b, "content") : campo(b, "description"));
    itens.push({ titulo, link, ...(data ? { data } : {}), ...(resumo && resumo !== titulo ? { resumo } : {}) });
    if (itens.length >= limite) break;
  }
  return itens;
}

/**
 * Texto do feed no charset certo. O charset vem da declaração <?xml encoding="…"?> ou do
 * Content-Type; sem nenhum, UTF-8. Alguns feeds do STJ (Jurisprudência em Teses) dizem UTF-8 mas
 * mandam ISO-8859-1: se os bytes não forem UTF-8 válido, lê como Windows-1252.
 */
export function decodificarFeed(bytes: Uint8Array, contentType: string | null): string {
  const doCabecalho = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  const inicio = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
  const daDeclaracao = inicio.match(/<\?xml[^>]*encoding=["']([\w-]+)["']/i)?.[1];
  const declarado = (daDeclaracao ?? doCabecalho ?? "utf-8").toLowerCase();
  if (declarado !== "utf-8" && declarado !== "utf8") {
    try {
      return new TextDecoder(declarado).decode(bytes);
    } catch {
      // charset desconhecido: segue para UTF-8
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
