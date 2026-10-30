import Anthropic from "@anthropic-ai/sdk";
import { AREA_LABEL, formatarValor, POLO_CLIENTE_LABEL, type Processo, TIPO_DEMANDA_LABEL } from "../../lib/processos.ts";
import { blocoDosPadroes } from "../../lib/padroes.ts";
import { formatProcesso } from "../../lib/utils.ts";
import { comCacheNosDocumentos, opcoesDeFallback } from "../ia/ia.ts";
import { type EntradaRedacao, type RedatorParecer, rotuloFonte } from "./redacao-parecer.ts";

const INSTRUCOES = `Você é um advogado brasileiro experiente que redige o parecer prévio de um caso para o escritório que representa o cliente.
Você recebe os PDFs do processo e, à parte, itens da biblioteca do escritório escolhidos pelo advogado: modelos de peça, jurisprudência, súmulas, legislação e doutrina.

Escreva o rascunho do parecer em português, em texto corrido com títulos curtos em linhas próprias (sem Markdown, sem asteriscos, sem tabelas), nesta ordem:
1. Síntese do caso
2. Questões jurídicas
3. Fundamentos (lei, súmulas e precedentes que apoiam ou ameaçam a posição do cliente)
4. Pontos fortes e pontos fracos
5. Riscos e chance de êxito
6. Estratégia recomendada e próximos passos

Regras:
- Use só os fatos que estão nos PDFs do processo e nos dados informados. Não invente fatos, valores, datas ou decisões.
- Cite jurisprudência, súmulas e artigos de lei preferindo os itens da biblioteca. Ao usar um deles, indique a referência como veio (por exemplo "Súmula 385/STJ").
- Se citar algo que não está na biblioteca nem nos PDFs, escreva [conferir] logo depois, para o advogado verificar antes de usar.
- Se houver um modelo de peça na biblioteca, siga a estrutura e o estilo dele naquilo que couber num parecer.
- Se já houver um parecer anterior, mantenha o que continuar valendo e atualize o resto.
- Se houver padrões do escritório, siga-os; a orientação do advogado para este rascunho prevalece sobre eles.
- Se o advogado der uma orientação, siga-a.
- Seja objetivo: o parecer é para uso interno do escritório.`;

function descreverProcesso(p: Processo): string {
  return [
    p.numero ? `Número: ${formatProcesso(p.numero)}` : "Ainda sem número (não protocolado)",
    p.area && `Área: ${AREA_LABEL[p.area]}`,
    p.tipo && `Tipo: ${TIPO_DEMANDA_LABEL[p.tipo]}`,
    `Cliente do escritório: ${p.cliente} (${POLO_CLIENTE_LABEL[p.polo]})`,
    p.parteContraria && `Parte contrária: ${p.parteContraria}`,
    p.tribunal && `Tribunal: ${p.tribunal}`,
    p.orgao && `Órgão julgador: ${p.orgao}`,
    p.comarca && `Comarca: ${p.comarca}`,
    p.classe && `Classe: ${p.classe}`,
    p.prescricao && `Prescrição em: ${p.prescricao}`,
    p.valorCausa !== undefined && `Valor da causa: ${formatarValor(p.valorCausa)}`,
    p.observacoes && `Observações do escritório: ${p.observacoes}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Monta o pedido: documentos primeiro (o que mais pesa), e por último o texto com os dados e a tarefa. */
export function montarConteudo(e: EntradaRedacao): Anthropic.Beta.BetaContentBlockParam[] {
  const pdf = (titulo: string, bytes: Uint8Array): Anthropic.Beta.BetaContentBlockParam => ({
    type: "document",
    title: titulo,
    source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") },
  });
  const conteudo: Anthropic.Beta.BetaContentBlockParam[] = e.documentos.map((d) => pdf(`Processo: ${d.nome}`, d.bytes));
  for (const f of e.biblioteca) {
    const titulo = `Biblioteca · ${rotuloFonte(f)}`;
    if (f.pdf) conteudo.push(pdf(titulo, f.pdf));
    else if (f.texto) conteudo.push({ type: "document", title: titulo, source: { type: "text", media_type: "text/plain", data: f.texto } });
  }

  const partes = [`Dados do processo:\n${descreverProcesso(e.processo)}`];
  partes.push(e.documentos.length ? `PDFs do processo, na ordem:\n${e.documentos.map((d, i) => `${i + 1}. ${d.nome}`).join("\n")}` : "Nenhum PDF do processo foi anexado.");
  if (e.biblioteca.length) partes.push(`Itens da biblioteca do escritório:\n${e.biblioteca.map((f) => `- ${rotuloFonte(f)}`).join("\n")}`);
  if (e.risco) partes.push(`Última análise de risco feita pela IA: ${e.risco.nivel}. ${e.risco.justificativa}`);
  if (e.parecerAtual) partes.push(`Parecer atual do escritório (atualize em vez de começar do zero):\n${e.parecerAtual}`);
  if (e.padroes) partes.push(blocoDosPadroes(e.padroes));
  if (e.orientacao) partes.push(`Orientação do advogado para este rascunho:\n${e.orientacao}`);
  partes.push("Redija o rascunho do parecer.");
  conteudo.push({ type: "text", text: partes.join("\n\n") });
  // Refazer o rascunho com outra orientação relê os PDFs pelo cache.
  return comCacheNosDocumentos(conteudo);
}

/** Rascunho do parecer pela API da Anthropic (Claude), que lê os PDFs direto, inclusive digitalizados. */
export class RedatorClaude implements RedatorParecer {
  readonly modelo: string;
  private readonly cliente: Anthropic;

  constructor(op: { chave: string; modelo: string; fetch?: typeof fetch }) {
    this.cliente = new Anthropic({ apiKey: op.chave, timeout: 10 * 60_000, maxRetries: 1, fetch: op.fetch });
    this.modelo = op.modelo;
  }

  async redigir(entrada: EntradaRedacao): Promise<string> {
    const stream = this.cliente.beta.messages.stream({
      model: this.modelo,
      max_tokens: 32000,
      ...opcoesDeFallback(this.modelo),
      output_config: { effort: "high" },
      system: INSTRUCOES,
      messages: [{ role: "user", content: montarConteudo(entrada) }],
    });
    const r = await stream.finalMessage();
    if (r.stop_reason === "refusal") throw new Error("O serviço recusou os documentos.");
    if (r.stop_reason === "max_tokens") throw new Error("O rascunho passou do tamanho máximo de resposta.");
    return r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  }
}
