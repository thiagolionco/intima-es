import Anthropic from "@anthropic-ai/sdk";
import { formatarValor, POLO_CLIENTE_LABEL, type Processo } from "../../lib/processos.ts";
import { formatProcesso } from "../../lib/utils.ts";
import type { AnalisadorRisco, ResultadoBruto } from "./analises.ts";

const INSTRUCOES = `Você é um advogado brasileiro experiente que faz a análise prévia de risco de processos judiciais para o escritório que representa o cliente.
Leia os PDFs anexados e avalie o risco do processo para o cliente do escritório, considerando o lado em que ele está.

Regras:
- Use só o que está nos documentos. Não invente fatos, valores, datas, decisões ou jurisprudência.
- Cada ponto forte ou fraco precisa apontar o documento (pela posição na lista, começando em 1) e a página do PDF em que se apoia. Sem apoio em uma página, não inclua o ponto.
- "Pontos fortes" favorecem o cliente; "pontos fracos" o prejudicam.
- Nível: "baixo", "medio" ou "alto" é o risco de o cliente perder ou ter prejuízo relevante. Use "indeterminado" quando os documentos não bastam para avaliar (por exemplo, só a capa ou uma procuração).
- A justificativa explica o nível em até 5 frases, em português claro, para o advogado responsável.
- No máximo 6 pontos fortes e 6 pontos fracos, cada um com uma ou duas frases.`;

const ponto = {
  type: "object",
  additionalProperties: false,
  required: ["texto", "documento", "pagina"],
  properties: {
    texto: { type: "string" },
    documento: { type: "integer", description: "Posição do documento na lista, começando em 1." },
    pagina: { type: "integer", description: "Página do PDF, começando em 1." },
  },
};

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["nivel", "justificativa", "pontosFortes", "pontosFracos"],
  properties: {
    nivel: { type: "string", enum: ["baixo", "medio", "alto", "indeterminado"] },
    justificativa: { type: "string" },
    pontosFortes: { type: "array", items: ponto },
    pontosFracos: { type: "array", items: ponto },
  },
};

function descreverProcesso(p: Processo, nomes: string[]): string {
  const linhas = [
    `Número: ${formatProcesso(p.numero)}`,
    `Cliente do escritório: ${p.cliente} (${POLO_CLIENTE_LABEL[p.polo]})`,
    p.parteContraria && `Parte contrária: ${p.parteContraria}`,
    p.tribunal && `Tribunal: ${p.tribunal}`,
    p.orgao && `Órgão julgador: ${p.orgao}`,
    p.classe && `Classe: ${p.classe}`,
    p.valorCausa !== undefined && `Valor da causa: ${formatarValor(p.valorCausa)}`,
  ].filter(Boolean);
  return `Dados do processo:\n${linhas.join("\n")}\n\nDocumentos anexados, na ordem:\n${nomes.map((n, i) => `${i + 1}. ${n}`).join("\n")}\n\nAnalise o risco do processo para o cliente.`;
}

/** Análise de risco pela API da Anthropic (Claude), que lê os PDFs direto, inclusive digitalizados. */
export class AnalisadorClaude implements AnalisadorRisco {
  readonly modelo: string;
  private readonly cliente: Anthropic;

  constructor(op: { chave: string; modelo: string; fetch?: typeof fetch }) {
    this.cliente = new Anthropic({ apiKey: op.chave, timeout: 10 * 60_000, maxRetries: 1, fetch: op.fetch });
    this.modelo = op.modelo;
  }

  async analisar({ processo, documentos }: { processo: Processo; documentos: { nome: string; bytes: Uint8Array }[] }): Promise<ResultadoBruto> {
    const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [
      ...documentos.map(
        (d): Anthropic.Beta.BetaContentBlockParam => ({
          type: "document",
          title: d.nome,
          source: { type: "base64", media_type: "application/pdf", data: Buffer.from(d.bytes).toString("base64") },
        }),
      ),
      { type: "text", text: descreverProcesso(processo, documentos.map((d) => d.nome)) },
    ];
    const stream = this.cliente.beta.messages.stream({
      model: this.modelo,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: { type: "json_schema", schema: ESQUEMA } },
      system: INSTRUCOES,
      messages: [{ role: "user", content: conteudo }],
    });
    const r = await stream.finalMessage();
    if (r.stop_reason === "refusal") throw new Error("O serviço de análise recusou os documentos.");
    if (r.stop_reason === "max_tokens") throw new Error("A análise passou do tamanho máximo de resposta.");
    const texto = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return JSON.parse(texto) as ResultadoBruto;
  }
}
