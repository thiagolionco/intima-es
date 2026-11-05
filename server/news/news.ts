import { unstable_cache } from "next/cache";
import { decodificarFeed, lerFeed, type ItemFeed } from "@/lib/news/feeds";
import { FEEDS, linkOficial, type FonteFeed } from "@/lib/news/fontes";

/** Etiqueta do cache da aba News; a ronda diária a invalida para buscar tudo de novo. */
export const ETIQUETA_NEWS = "news";
const DIA = 24 * 3600;
const LIMITE_BYTES = 2 * 1024 * 1024;

export interface LeituraFonte {
  id: string;
  ok: boolean;
  lidoEm: string;
  itens: ItemFeed[];
  erro?: string;
}

async function baixar(fonte: FonteFeed): Promise<LeituraFonte> {
  const res = await fetch(fonte.url, {
    headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9", "User-Agent": "Clepsa/1.0 (leitor de feeds oficiais)" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > LIMITE_BYTES) throw new Error("Feed grande demais");
  const texto = decodificarFeed(bytes, res.headers.get("content-type"));
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(texto)) throw new Error("A resposta não é um feed");
  const itens = lerFeed(texto, 15).filter((i) => linkOficial(i.link));
  return { id: fonte.id, ok: true, lidoEm: new Date().toISOString(), itens };
}

/**
 * Lê uma fonte com cache de um dia. Falha não fica guardada (unstable_cache não guarda exceções),
 * então a próxima abertura da aba tenta de novo.
 */
async function lerFonte(fonte: FonteFeed): Promise<LeituraFonte> {
  try {
    return await unstable_cache(() => baixar(fonte), ["news-v1", fonte.id], { revalidate: DIA, tags: [ETIQUETA_NEWS] })();
  } catch (e) {
    return { id: fonte.id, ok: false, lidoEm: new Date().toISOString(), itens: [], erro: motivo(e) };
  }
}

function motivo(e: unknown): string {
  if (!(e instanceof Error)) return "Falha ao ler";
  const causa = (e as { cause?: { code?: string; message?: string } }).cause;
  return [e.message, causa?.code ?? causa?.message].filter(Boolean).join(": ").slice(0, 160);
}

export async function lerNews(): Promise<{ fontes: LeituraFonte[] }> {
  return { fontes: await Promise.all(FEEDS.map(lerFonte)) };
}
