import { blocoDosPadroes } from "../../lib/padroes.ts";
import { type AcaoEditor, LIMITES_EDITOR, type SugestaoEditor } from "../../lib/editor.ts";
import { novoId } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import { idValido } from "../registros/registros.ts";
import { descreverProcesso, type ContextoProcesso, falhaDaIa, semIa } from "./contexto-processo.ts";
import { perguntarJson, type ServicoIa } from "./ia.ts";
import type { PadroesService } from "./padroes.ts";

const OBJETIVO: Record<Exclude<AcaoEditor, "traduzir">, string> = {
  revisar:
    "Revise o texto como um sócio revisaria: aponte erros de fato em relação aos dados do processo, contradições, afirmações sem fundamento, citações duvidosas, ambiguidades e problemas de português.",
  melhorar: "Melhore a redação: frases mais claras e diretas, sem mudar o sentido jurídico nem os fatos.",
  anonimizar:
    "Anonimize o texto: troque nomes de pessoas físicas e jurídicas por papéis entre colchetes ([AUTOR], [RÉU], [EMPRESA], [TESTEMUNHA 1]), e CPF, CNPJ, RG, endereços, telefones, e-mails, números de conta e placas por [DADO REMOVIDO]. Mantenha datas, valores e números de processo, a menos que a orientação diga o contrário. Use o mesmo papel para a mesma pessoa no texto todo.",
};

const INSTRUCOES = `Você ajuda um advogado a editar um parecer jurídico. Em vez de reescrever tudo, você propõe trocas pontuais que ele aceita ou recusa uma a uma.
Regras:
- "original" é um trecho copiado EXATAMENTE do texto (mesmas letras, pontuação e espaços), curto o bastante para ser único: uma frase ou parte dela.
- "novo" é o que entra no lugar. "motivo" explica a troca em uma frase.
- Não proponha trocas que só mudam o estilo sem melhorar nada. No máximo 40 trocas.`;

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sugestoes"],
  properties: {
    sugestoes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["original", "novo", "motivo"],
        properties: { original: { type: "string" }, novo: { type: "string" }, motivo: { type: "string" } },
      },
    },
  },
};

const INSTRUCOES_TRADUCAO = `Traduza o texto jurídico para o idioma pedido, mantendo os parágrafos, os títulos e a estrutura.
Termos sem equivalente exato: traduza e deixe o original entre parênteses na primeira vez (por exemplo, "interlocutory appeal (agravo de instrumento)").
Responda só com a tradução, sem comentários.`;

const IDIOMAS: Record<string, string> = { en: "inglês", es: "espanhol", fr: "francês", it: "italiano", de: "alemão" };

/** Mantém só as trocas cujo trecho original existe uma vez no texto e de fato muda algo. */
export function filtrarSugestoes(texto: string, brutas: unknown): SugestaoEditor[] {
  const lista = Array.isArray(brutas) ? brutas : [];
  const usados: [number, number][] = [];
  const saida: SugestaoEditor[] = [];
  for (const s of lista) {
    const { original, novo, motivo } = (s ?? {}) as Record<string, unknown>;
    if (typeof original !== "string" || typeof novo !== "string" || !original || original === novo) continue;
    const i = texto.indexOf(original);
    if (i < 0 || texto.indexOf(original, i + 1) >= 0) continue;
    const fim = i + original.length;
    // Trechos que se sobrepõem não podem ser aceitos juntos: fica o primeiro.
    if (usados.some(([a, b]) => i < b && fim > a)) continue;
    usados.push([i, fim]);
    saida.push({ id: novoId(), original, novo: novo.slice(0, 5000), motivo: typeof motivo === "string" ? motivo.trim().slice(0, 300) : "" });
    if (saida.length >= LIMITES_EDITOR.sugestoes) break;
  }
  return saida.sort((a, b) => texto.indexOf(a.original) - texto.indexOf(b.original));
}

/** Ações da IA no editor do parecer (revisar, melhorar, anonimizar, traduzir). Nada é gravado aqui. */
export class EditorIaService {
  private readonly contexto: ContextoProcesso;
  private readonly padroes: PadroesService;
  private readonly ia?: ServicoIa;
  private readonly limitar: (usuarioId: string) => void;

  constructor(d: { contexto: ContextoProcesso; padroes: PadroesService; ia?: ServicoIa; limitar?: (usuarioId: string) => void }) {
    this.contexto = d.contexto;
    this.padroes = d.padroes;
    this.ia = d.ia;
    this.limitar = d.limitar ?? (() => undefined);
  }

  get disponivel() {
    return !!this.ia;
  }

  async executar(usuarioId: string, processoId: string, corpo: unknown): Promise<{ sugestoes: SugestaoEditor[] } | { traducao: string; idioma: string }> {
    const ia = this.ia;
    if (!ia) throw semIa("A ajuda do editor");
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    const acao = c.acao as AcaoEditor;
    if (!["revisar", "melhorar", "anonimizar", "traduzir"].includes(acao)) throw new AppError("dados_invalidos", "Ação inválida.");
    const texto = typeof c.texto === "string" ? c.texto.replace(/\r\n/g, "\n") : "";
    if (!texto.trim()) throw new AppError("dados_invalidos", "Escreva o texto antes.");
    if (texto.length > LIMITES_EDITOR.texto) throw new AppError("dados_invalidos", "O texto é grande demais para a IA de uma vez.");
    const orientacao = typeof c.orientacao === "string" ? c.orientacao.trim().slice(0, 1000) : "";
    const processo = idValido(processoId) ? await this.contexto.processo(usuarioId, processoId) : null;
    if (!processo) throw new AppError("nao_encontrado", "Processo não encontrado.");
    this.limitar(usuarioId);

    try {
      if (acao === "traduzir") {
        const idioma = typeof c.idioma === "string" && IDIOMAS[c.idioma] ? c.idioma : "en";
        const r = await ia.perguntar({
          sistema: INSTRUCOES_TRADUCAO,
          esforco: "medium",
          blocos: [{ tipo: "documento", titulo: "Parecer", texto }, { tipo: "texto", texto: `Traduza para o ${IDIOMAS[idioma]}.${orientacao ? `\nOrientação: ${orientacao}` : ""}` }],
        });
        return { traducao: r.texto.trim(), idioma };
      }
      const padroes = await this.padroes.instrucoes(usuarioId, "editor");
      const { dados } = await perguntarJson<{ sugestoes: unknown[] }>(ia, {
        sistema: INSTRUCOES,
        esquema: ESQUEMA,
        esforco: acao === "revisar" ? "high" : "medium",
        blocos: [
          { tipo: "documento", titulo: "Parecer em edição", texto },
          {
            tipo: "texto",
            texto: [`Dados do processo:\n${descreverProcesso(processo)}`, OBJETIVO[acao], blocoDosPadroes(padroes), orientacao && `Orientação do advogado: ${orientacao}`].filter(Boolean).join("\n\n"),
          },
        ],
      });
      return { sugestoes: filtrarSugestoes(texto, dados.sugestoes) };
    } catch (e) {
      throw falhaDaIa("editor", e);
    }
  }
}
