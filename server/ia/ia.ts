import Anthropic from "@anthropic-ai/sdk";

/** Um pedaço do que a IA lê: PDF, documento de texto com título ou texto solto. */
export type BlocoIa = { tipo: "pdf"; titulo: string; bytes: Uint8Array } | { tipo: "documento"; titulo: string; texto: string } | { tipo: "texto"; texto: string };

export interface PedidoIa {
  sistema: string;
  blocos: BlocoIa[];
  /** Com esquema, a resposta vem em JSON nesse formato (saída estruturada). */
  esquema?: Record<string, unknown>;
  /** Liga a pesquisa na web, restrita aos domínios dados (sites oficiais). */
  pesquisaWeb?: { maxUsos: number; dominios?: string[] };
  esforco?: "low" | "medium" | "high";
  /** Tarefa simples (resumo curto, triagem, extração): vai para o modelo mais barato. Sem pesquisa na web. */
  simples?: boolean;
}

export interface FonteWeb {
  titulo: string;
  url: string;
}

export interface RespostaIa {
  texto: string;
  /** Páginas que a pesquisa na web abriu, na ordem em que apareceram. */
  fontesWeb: FonteWeb[];
  /** Modelo que respondeu (o simples ou o principal). */
  modelo: string;
}

/**
 * IA usada pelas ferramentas novas (padrões, citações, linha do tempo, tabela, providências,
 * assistente, pedidos, monitor). Sem implementação configurada, cada ferramenta se desliga.
 */
export interface ServicoIa {
  readonly modelo: string;
  perguntar(p: PedidoIa): Promise<RespostaIa>;
}

/** Pergunta e já devolve o JSON da resposta. */
export async function perguntarJson<T>(ia: ServicoIa, p: PedidoIa & { esquema: Record<string, unknown> }): Promise<{ dados: T; fontesWeb: FonteWeb[]; modelo: string }> {
  const r = await ia.perguntar(p);
  return { dados: JSON.parse(r.texto) as T, fontesWeb: r.fontesWeb, modelo: r.modelo };
}

/** Sites oficiais em que a pesquisa na web pode procurar leis, súmulas e decisões. */
export const DOMINIOS_OFICIAIS = [
  "planalto.gov.br",
  "stf.jus.br",
  "stj.jus.br",
  "tst.jus.br",
  "tse.jus.br",
  "cnj.jus.br",
  "jus.br",
  "camara.leg.br",
  "senado.leg.br",
  "lexml.gov.br",
];

function paraConteudo(b: BlocoIa): Anthropic.Beta.BetaContentBlockParam {
  if (b.tipo === "pdf") {
    return { type: "document", title: b.titulo, source: { type: "base64", media_type: "application/pdf", data: Buffer.from(b.bytes).toString("base64") } };
  }
  if (b.tipo === "documento") return { type: "document", title: b.titulo, source: { type: "text", media_type: "text/plain", data: b.texto } };
  return { type: "text", text: b.texto };
}

/**
 * Marca o último documento para o cache de prompt: perguntas seguidas sobre os mesmos PDFs
 * (em até 5 minutos) releem os documentos por cerca de 10% do preço.
 */
export function comCacheNosDocumentos(conteudo: Anthropic.Beta.BetaContentBlockParam[]): Anthropic.Beta.BetaContentBlockParam[] {
  const i = conteudo.findLastIndex((b) => b.type === "document");
  if (i < 0) return conteudo;
  return conteudo.map((b, j) => (j === i ? ({ ...b, cache_control: { type: "ephemeral" } } as Anthropic.Beta.BetaContentBlockParam) : b));
}

/** Monta o pedido: documentos primeiro, textos depois, na ordem dada. */
export function montarConteudoIa(blocos: BlocoIa[]): Anthropic.Beta.BetaContentBlockParam[] {
  const docs = blocos.filter((b) => b.tipo !== "texto").map(paraConteudo);
  const textos = blocos.filter((b) => b.tipo === "texto").map(paraConteudo);
  return comCacheNosDocumentos([...docs, ...textos]);
}

/** O Haiku não tem o fallback do lado do servidor; os outros modelos usam o padrão da Anthropic. */
export function opcoesDeFallback(modelo: string): { betas?: string[]; fallbacks?: "default" } {
  return modelo.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
}

/** Quantas vezes seguimos um turno que a API pausou (pesquisa na web longa). */
const RETOMADAS = 3;

/** IA pela API da Anthropic (Claude), que lê os PDFs direto, inclusive digitalizados. */
export class IaClaude implements ServicoIa {
  readonly modelo: string;
  private readonly modeloSimples: string;
  private readonly cliente: Anthropic;

  constructor(op: { chave: string; modelo: string; modeloSimples?: string; fetch?: typeof fetch }) {
    this.cliente = new Anthropic({ apiKey: op.chave, timeout: 10 * 60_000, maxRetries: 1, fetch: op.fetch });
    this.modelo = op.modelo;
    this.modeloSimples = op.modeloSimples ?? op.modelo;
  }

  async perguntar(p: PedidoIa): Promise<RespostaIa> {
    // A pesquisa na web pede o modelo principal (o Haiku não tem a versão com filtro).
    const modelo = p.simples && !p.pesquisaWeb ? this.modeloSimples : this.modelo;
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: montarConteudoIa(p.blocos) }];
    const tools: Anthropic.Beta.BetaToolUnion[] = p.pesquisaWeb
      ? [{ type: "web_search_20260209", name: "web_search", max_uses: p.pesquisaWeb.maxUsos, ...(p.pesquisaWeb.dominios ? { allowed_domains: p.pesquisaWeb.dominios } : {}) }]
      : [];
    const fontesWeb: FonteWeb[] = [];
    const vistas = new Set<string>();
    for (let i = 0; i <= RETOMADAS; i++) {
      const stream = this.cliente.beta.messages.stream({
        model: modelo,
        max_tokens: 32000,
        ...opcoesDeFallback(modelo),
        output_config: { effort: p.esforco ?? "high", ...(p.esquema ? { format: { type: "json_schema", schema: p.esquema } } : {}) },
        system: p.sistema,
        messages,
        ...(tools.length ? { tools } : {}),
      });
      const r = await stream.finalMessage();
      for (const b of r.content) {
        if (b.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue;
        for (const s of b.content) {
          if (s.type === "web_search_result" && !vistas.has(s.url)) {
            vistas.add(s.url);
            fontesWeb.push({ titulo: s.title, url: s.url });
          }
        }
      }
      if (r.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: r.content });
        continue;
      }
      if (r.stop_reason === "refusal") throw new Error("O serviço recusou o pedido.");
      if (r.stop_reason === "max_tokens") throw new Error("A resposta passou do tamanho máximo.");
      // Com pesquisa na web, o texto final é o último bloco de texto (os anteriores comentam a busca).
      const textos = r.content.flatMap((b) => (b.type === "text" ? [b.text] : []));
      const texto = p.esquema ? (textos.at(-1) ?? "") : textos.join("");
      return { texto, fontesWeb, modelo };
    }
    throw new Error("A pesquisa demorou demais.");
  }
}
