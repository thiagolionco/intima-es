import {
  conferir,
  type DadosAgentePrazos,
  type LeituraPrazo,
  leituraPorRegras,
  leituraValida,
  pedeReleitura,
  type PropostaPrazo,
  TIPOS_LEITURA,
} from "../../lib/prazos/agente-prazos.ts";
import { rotuloTarefa } from "../../lib/tarefas.ts";
import type { Suspensao } from "../../lib/types.ts";
import type { Clock } from "../core/clock.ts";
import { AppError } from "../core/errors.ts";
import type { EspacoTrabalhoRepository } from "../workspace/espaco-trabalho.ts";
import { falhaDaIa } from "./contexto-processo.ts";
import { perguntarJson, type ServicoIa } from "./ia.ts";

/**
 * Agente de Prazos (piloto). O fluxo, em ordem:
 *
 *   publicação ──► LEITOR (Haiku, barato) ──► CONFERENTE (código, sem IA) ──► advogado confirma
 *                                                  │ achou erro grave?
 *                                                  ▼
 *                                   RELEITURA (Sonnet, uma vez só, com os erros apontados)
 *                                                  │
 *                                                  ▼
 *                                             CONFERENTE de novo
 *
 * No máximo duas chamadas à IA por publicação. A IA não grava nada e não conta dias.
 */

/** As instruções do leitor. Mudou aqui? Rode `npm run avaliar:prazos -- --ia` antes de juntar. */
export const INSTRUCOES_LEITOR = `Você é o controlador de prazos de um escritório de advocacia brasileiro. Lê UMA publicação do Diário de Justiça (DJEN) e diz o que ela pede.
Responda só com os campos pedidos. Regras:
- tarefa: a providência principal para a parte intimada, uma destas: ${TIPOS_LEITURA.join(", ")}. Sentença, acórdão ou decisão que possa ser recorrida = avaliar_recurso. Sem providência = ciencia. Não deu para saber = analisar.
- dias: se o juízo escreveu o número de dias, use esse número (prazoFixado = true). Se escreveu "prazo legal" ou não disse, use o prazo da lei para o ato (prazoFixado = false):
  • Cível (CPC): contestação, réplica, apelação, agravo, contrarrazões, pagamento (art. 523), emenda da inicial, quesitos/assistente técnico, alegações finais: 15. Embargos de declaração: 5. Manifestação sem prazo fixado: 5 (art. 218, § 3º).
  • Juizados especiais (Lei 9.099): recurso inominado e contrarrazões: 10. Embargos de declaração: 5.
  • Trabalho (CLT): recurso ordinário, agravo de petição, recurso de revista e contrarrazões: 8. Embargos de declaração: 5.
  • Penal (CPP): resposta à acusação: 10. Apelação: 5. Recurso em sentido estrito: 5. Embargos de declaração: 2. Memoriais (alegações finais): 5.
  • Audiência, só ciência ou sem providência: 0.
- contagem: "corridos" em matéria penal (CPP, art. 798); "uteis" no resto (CPC, art. 219; CLT, art. 775; Lei 9.099, art. 12-A). Se o texto disser úteis ou corridos, siga o texto.
- dobro: true só se o texto mostrar que a intimada é Fazenda Pública, Ministério Público ou Defensoria (arts. 180, 183 e 186 do CPC) ou disser "em dobro". Nunca presuma.
- dias é o prazo simples, SEM dobrar (o sistema dobra quando dobro = true).
- fundamento: "Fixado pelo juízo" ou o artigo de lei do prazo.
- trecho: copie LITERALMENTE, sem mudar nenhuma palavra, a frase da publicação (até 200 caracteres) que sustenta a tarefa e o prazo.
- dataAudiencia (AAAA-MM-DD) e horaAudiencia (HH:MM): só para audiência; senão "".
- confianca: alta, media ou baixa. Use baixa quando o texto for ambíguo ou cortado.
- observacao: uma frase para o advogado, ou "".
- NUNCA calcule a data do vencimento. O sistema calcula com o calendário do tribunal.`;

export const ESQUEMA_LEITURA = {
  type: "object",
  additionalProperties: false,
  required: ["tarefa", "dias", "contagem", "dobro", "prazoFixado", "fundamento", "trecho", "dataAudiencia", "horaAudiencia", "confianca", "observacao"],
  properties: {
    tarefa: { type: "string", enum: TIPOS_LEITURA },
    dias: { type: "integer" },
    contagem: { type: "string", enum: ["uteis", "corridos"] },
    dobro: { type: "boolean" },
    prazoFixado: { type: "boolean" },
    fundamento: { type: "string" },
    trecho: { type: "string" },
    dataAudiencia: { type: "string" },
    horaAudiencia: { type: "string" },
    confianca: { type: "string", enum: ["alta", "media", "baixa"] },
    observacao: { type: "string" },
  },
};

/** O máximo de texto da publicação que vai para a IA (publicações enormes são raras e caras). */
const LIMITE_TEXTO = 20_000;

function descrever(i: DadosAgentePrazos): string {
  return [
    `Tribunal: ${i.tribunal || "não informado"}`,
    `Órgão: ${i.orgao || "não informado"}`,
    `Classe: ${i.classe || "não informada"}`,
    `Tipo de documento: ${i.tipoDocumento || "não informado"}`,
    `Tipo de comunicação: ${i.tipoComunicacao || "não informado"}`,
    `Disponibilizada em: ${i.dataDisponibilizacao}`,
  ].join("\n");
}

async function ler(ia: ServicoIa, i: DadosAgentePrazos, simples: boolean, revisao?: { leitura: LeituraPrazo; problemas: string[] }): Promise<{ leitura: LeituraPrazo; modelo: string }> {
  const pedido = revisao
    ? `Um conferente automático reprovou a leitura anterior:\n${JSON.stringify(revisao.leitura)}\nProblemas apontados:\n${revisao.problemas.map((p) => `- ${p}`).join("\n")}\nReleia a publicação e corrija o que o texto realmente sustenta. Se a leitura anterior estava certa, repita-a.`
    : "Leia a publicação e responda.";
  const { dados, modelo } = await perguntarJson<unknown>(ia, {
    sistema: INSTRUCOES_LEITOR,
    esquema: ESQUEMA_LEITURA,
    simples,
    esforco: simples ? "low" : "medium",
    blocos: [
      { tipo: "documento", titulo: "Publicação", texto: (i.texto ?? "").slice(0, LIMITE_TEXTO) || "(sem texto)" },
      { tipo: "texto", texto: `${descrever(i)}\n\n${pedido}` },
    ],
  });
  const leitura = leituraValida(dados);
  if (!leitura) throw new Error("A IA respondeu fora do formato.");
  return { leitura, modelo };
}

/**
 * Roda o agente numa publicação. Sem IA, usa as regras (custo zero). Exportada à parte do serviço
 * para o script de avaliação chamar sem banco nem servidor.
 */
export async function executarAgentePrazos(d: { ia?: ServicoIa; intimacao: DadosAgentePrazos; suspensoes: Suspensao[]; hoje: string }): Promise<PropostaPrazo> {
  const { ia, intimacao: i, suspensoes, hoje } = d;
  if (!ia) {
    const leitura = leituraPorRegras(i);
    return { leitura, conferencia: conferir(i, leitura, suspensoes, hoje), leitor: "regras", tentativas: 0, modelos: [] };
  }
  // Passo 1: leitura barata.
  const primeira = await ler(ia, i, true);
  const c1 = conferir(i, primeira.leitura, suspensoes, hoje);
  if (!pedeReleitura(c1, primeira.leitura)) return { leitura: primeira.leitura, conferencia: c1, leitor: primeira.modelo, tentativas: 1, modelos: [primeira.modelo] };

  // Passo 2: o conferente reprovou. Uma releitura pelo modelo principal, com os problemas apontados.
  const problemas = c1.alertas.filter((a) => a.gravidade !== "info").map((a) => a.texto);
  if (primeira.leitura.confianca === "baixa" && !problemas.length) problemas.push("O leitor disse ter pouca certeza.");
  try {
    const segunda = await ler(ia, i, false, { leitura: primeira.leitura, problemas });
    const c2 = conferir(i, segunda.leitura, suspensoes, hoje);
    return { leitura: segunda.leitura, conferencia: c2, leitor: segunda.modelo, tentativas: 2, modelos: [primeira.modelo, segunda.modelo] };
  } catch (e) {
    // A releitura falhou: fica a primeira, que já está marcada para revisar.
    console.error("[agente-prazos] releitura falhou:", e instanceof Error ? e.message : e);
    return { leitura: primeira.leitura, conferencia: c1, leitor: primeira.modelo, tentativas: 1, modelos: [primeira.modelo] };
  }
}

/** Resumo da proposta em uma linha, para o log e para o script de avaliação. */
export function linhaDaProposta(p: PropostaPrazo): string {
  const { leitura: l, conferencia: c } = p;
  const prazo = l.dias ? `${l.dias}${l.dobro ? "×2" : ""} ${l.contagem === "uteis" ? "úteis" : "corridos"}` : "sem prazo";
  return `${rotuloTarefa(l.tarefa)} · ${prazo} · ${c.calculo?.fim ?? "—"} · ${c.situacao}`;
}

/** O serviço da rota: carrega a intimação e as suspensões do escritório e roda o agente. */
export class AgentePrazosService {
  private readonly espacos: EspacoTrabalhoRepository;
  private readonly ia?: ServicoIa;
  private readonly clock: Clock;
  private readonly limitar: (usuarioId: string) => void;

  constructor(d: { espacos: EspacoTrabalhoRepository; ia?: ServicoIa; clock: Clock; limitar?: (usuarioId: string) => void }) {
    this.espacos = d.espacos;
    this.ia = d.ia;
    this.clock = d.clock;
    this.limitar = d.limitar ?? (() => undefined);
  }

  /** Com IA ligada no servidor; sem ela, o agente ainda responde pelas regras. */
  get disponivel() {
    return !!this.ia;
  }

  async propor(usuarioId: string, corpo: unknown): Promise<PropostaPrazo> {
    const { intimacaoId, semIa } = (corpo ?? {}) as { intimacaoId?: unknown; semIa?: unknown };
    if (typeof intimacaoId !== "string" || !intimacaoId || intimacaoId.length > 200) throw new AppError("dados_invalidos", "Intimação inválida.");
    const espaco = await this.espacos.ler(usuarioId);
    const i = espaco.intimacoes.find((x) => x.id === intimacaoId);
    if (!i) throw new AppError("nao_encontrado", "Intimação não encontrada.");
    if (!(i.texto ?? "").trim()) throw new AppError("dados_invalidos", "A intimação não tem texto para ler.");
    const ia = semIa === true ? undefined : this.ia;
    // Só a versão com IA gasta cota; a de regras é de graça.
    if (ia) this.limitar(usuarioId);
    const hoje = new Date(this.clock.agora().getTime() - 3 * 3600_000).toISOString().slice(0, 10);
    try {
      return await executarAgentePrazos({ ia, intimacao: i, suspensoes: espaco.suspensoes ?? [], hoje });
    } catch (e) {
      throw falhaDaIa("agente-prazos", e);
    }
  }
}
