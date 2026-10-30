import Anthropic from "@anthropic-ai/sdk";
import type { Intimacao } from "../../lib/types.ts";
import { opcoesDeFallback } from "../ia/ia.ts";
import type { AnotarUsoIa } from "../ia/uso.ts";

/** Gera o resumo de uma intimação. Sem implementação configurada, o Clepsa funciona sem resumos. */
export interface Resumidor {
  readonly nome: string;
  resumir(i: Pick<Intimacao, "texto" | "tipoDocumento" | "classe" | "orgao">): Promise<string>;
}

const INSTRUCOES = `Você resume intimações publicadas no Diário de Justiça Eletrônico Nacional para advogados brasileiros.
Responda com exatamente duas linhas, em português, sem marcadores, títulos ou aspas:
1ª linha: o que o juízo decidiu ou determinou, em linguagem direta.
2ª linha: o que o advogado precisa fazer e em que prazo, como está no texto; se não houver providência, escreva "Sem providência: apenas ciência."
Cada linha com no máximo 140 caracteres. Não invente prazos, valores ou nomes que não estejam no texto.`;

/** Limpa a resposta: no máximo duas linhas não vazias, cada uma com tamanho limitado. */
export function normalizarResumo(texto: string): string {
  return texto
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)ª]?)\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((l) => (l.length > 180 ? `${l.slice(0, 179).trimEnd()}…` : l))
    .join("\n");
}

/** Resumo pela API da Anthropic (Claude). Só é criado quando há ANTHROPIC_API_KEY. */
export class ResumidorClaude implements Resumidor {
  readonly nome = "Claude";
  private readonly cliente: Anthropic;
  private readonly modelo: string;
  private readonly anotarUso?: AnotarUsoIa;

  constructor(op: { chave: string; modelo: string; anotarUso?: AnotarUsoIa }) {
    this.cliente = new Anthropic({ apiKey: op.chave, timeout: 60_000, maxRetries: 2 });
    this.modelo = op.modelo;
    this.anotarUso = op.anotarUso;
  }

  async resumir(i: Pick<Intimacao, "texto" | "tipoDocumento" | "classe" | "orgao">): Promise<string> {
    const texto = (i.texto ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const r = await this.cliente.beta.messages.create({
      model: this.modelo,
      max_tokens: 4000,
      ...opcoesDeFallback(this.modelo),
      output_config: { effort: "low" },
      system: INSTRUCOES,
      messages: [
        {
          role: "user",
          content: `Tipo de documento: ${i.tipoDocumento || "não informado"}\nClasse: ${i.classe || "não informada"}\nÓrgão: ${i.orgao || "não informado"}\n\nTexto da intimação:\n${texto}`,
        },
      ],
    });
    void this.anotarUso?.("resumo", r.model, r.usage);
    if (r.stop_reason === "refusal") throw new Error("O serviço de resumo recusou este texto.");
    const saida = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    const resumo = normalizarResumo(saida);
    if (!resumo) throw new Error("O serviço de resumo não devolveu texto.");
    return resumo;
  }
}
