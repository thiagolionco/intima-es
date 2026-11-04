import type { BlocoIa, PedidoIa, RespostaIa, ServicoIa } from "./ia.ts";

/**
 * IA LOCAL pelo Ollama (https://ollama.com), rodando no próprio computador. Só para EXPERIMENTOS:
 * o script de avaliação usa isto para comparar um modelo pequeno (ex.: qwen2.5:3b) com o Claude
 * nas mesmas publicações. O servidor do Clepsa não usa esta classe.
 *
 * Limites, de propósito: lê só texto (PDF e pesquisa na web ficam de fora) e responde em JSON
 * pelo esquema pedido (saída estruturada do Ollama). Nada sai do computador.
 */
export class IaOllama implements ServicoIa {
  readonly modelo: string;
  private readonly modeloSimples: string;
  private readonly url: string;
  private readonly contexto: number;
  private readonly fetchFn: typeof fetch;

  constructor(op: { modelo: string; modeloSimples?: string; url?: string; contexto?: number; fetch?: typeof fetch }) {
    this.modelo = op.modelo;
    this.modeloSimples = op.modeloSimples ?? op.modelo;
    this.url = (op.url ?? "http://localhost:11434").replace(/\/+$/, "");
    this.contexto = op.contexto ?? 8192;
    this.fetchFn = op.fetch ?? fetch;
  }

  /** Confere se o Ollama está aberto e se os modelos já foram baixados; devolve a mensagem de erro em português. */
  async verificar(): Promise<string | null> {
    let nomes: string[];
    try {
      const r = await this.fetchFn(`${this.url}/api/tags`);
      if (!r.ok) return `O Ollama respondeu com erro ${r.status} em ${this.url}.`;
      const j = (await r.json()) as { models?: { name: string }[] };
      nomes = (j.models ?? []).map((m) => m.name);
    } catch {
      return `Não consegui falar com o Ollama em ${this.url}. Ele está aberto? (ícone da lhama perto do relógio, ou rode "ollama serve").`;
    }
    const tem = (m: string) => nomes.some((n) => n === m || n === `${m}:latest`);
    const faltam = [...new Set([this.modelo, this.modeloSimples])].filter((m) => !tem(m));
    if (faltam.length) return `O modelo ${faltam.join(" e ")} ainda não foi baixado. Rode: ollama pull ${faltam[0]}`;
    return null;
  }

  async perguntar(p: PedidoIa): Promise<RespostaIa> {
    const modelo = p.simples ? this.modeloSimples : this.modelo;
    const r = await this.fetchFn(`${this.url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: modelo,
        stream: false,
        // Modelo pequeno com tempo livre inventa; temperatura 0 deixa a resposta repetível.
        options: { temperature: 0, num_ctx: this.contexto },
        ...(p.esquema ? { format: p.esquema } : {}),
        messages: [
          { role: "system", content: p.sistema },
          { role: "user", content: montarTexto(p.blocos) },
        ],
      }),
    });
    if (!r.ok) throw new Error(`Ollama respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = (await r.json()) as { message?: { content?: string } };
    return { texto: j.message?.content ?? "", fontesWeb: [], modelo };
  }
}

/** Junta os blocos em um texto só: documentos primeiro (com título), depois as instruções. */
export function montarTexto(blocos: BlocoIa[]): string {
  const docs = blocos.flatMap((b) => {
    if (b.tipo === "documento") return [`<documento titulo="${b.titulo}">\n${b.texto}\n</documento>`];
    if (b.tipo === "pdf") return [`<documento titulo="${b.titulo}">(PDF não lido: a IA local só lê texto)</documento>`];
    return [];
  });
  const textos = blocos.flatMap((b) => (b.tipo === "texto" ? [b.texto] : []));
  return [...docs, ...textos].join("\n\n");
}
