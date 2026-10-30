import { blocoDosPadroes } from "../../lib/padroes.ts";
import type { ResultadoPesquisa } from "../../lib/pesquisa.ts";
import { AppError } from "../core/errors.ts";
import { textoLimpo } from "../registros/registros.ts";
import { falhaDaIa, semIa } from "./contexto-processo.ts";
import { DOMINIOS_OFICIAIS, perguntarJson, type ServicoIa } from "./ia.ts";
import type { PadroesService } from "./padroes.ts";

const INSTRUCOES = `Você é um pesquisador jurídico brasileiro. Responda à pergunta do advogado pesquisando nas fontes oficiais (Planalto, STF, STJ, TST, tribunais).
Regras:
- Prefira, nesta ordem: Constituição e leis, súmulas vinculantes, temas de repercussão geral e repetitivos, súmulas, precedentes dos tribunais superiores, decisões de tribunais locais.
- Só cite o que encontrou em fonte oficial nesta pesquisa, com a URL. Não invente número de processo, data ou ementa.
- Diga se o entendimento é pacífico ou se há divergência, e se algo foi revogado, cancelado ou superado.
- A resposta tem até 12 frases, em português claro, para o advogado.`;

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["resposta", "fontes"],
  properties: {
    resposta: { type: "string" },
    fontes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tipo", "referencia", "tribunal", "resumo", "url"],
        properties: {
          tipo: { type: "string", enum: ["legislacao", "sumula", "jurisprudencia"] },
          referencia: { type: "string", description: "Ex.: Súmula 385/STJ, REsp 1.234.567/SP, Art. 14 do CDC." },
          tribunal: { type: "string", description: "Sigla, ou vazio para legislação." },
          resumo: { type: "string" },
          url: { type: "string" },
        },
      },
    },
  },
};

const oficial = (url: unknown): string | undefined => {
  if (typeof url !== "string") return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && DOMINIOS_OFICIAIS.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`)) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
};

/** Pesquisa jurídica pela IA nas fontes oficiais, com cada fonte conferível pelo link. */
export class PesquisaService {
  private readonly padroes: PadroesService;
  private readonly ia?: ServicoIa;
  private readonly limitar: (usuarioId: string) => void;

  constructor(d: { padroes: PadroesService; ia?: ServicoIa; limitar?: (usuarioId: string) => void }) {
    this.padroes = d.padroes;
    this.ia = d.ia;
    this.limitar = d.limitar ?? (() => undefined);
  }

  get disponivel() {
    return !!this.ia;
  }

  async pesquisar(usuarioId: string, corpo: unknown, contexto?: string): Promise<ResultadoPesquisa> {
    const ia = this.ia;
    if (!ia) throw semIa("A pesquisa");
    const pergunta = textoLimpo((corpo as { pergunta?: unknown } | null)?.pergunta, 2000);
    if (!pergunta) throw new AppError("dados_invalidos", "Escreva o que quer pesquisar.", { campo: "pergunta" });
    this.limitar(usuarioId);
    const padroes = await this.padroes.instrucoes(usuarioId, "citacoes");
    try {
      const { dados, fontesWeb } = await perguntarJson<{ resposta: string; fontes: Record<string, unknown>[] }>(ia, {
        sistema: INSTRUCOES,
        esquema: ESQUEMA,
        pesquisaWeb: { maxUsos: 10, dominios: DOMINIOS_OFICIAIS },
        blocos: [{ tipo: "texto", texto: [contexto && `Contexto do caso:\n${contexto}`, blocoDosPadroes(padroes), `Pergunta: ${pergunta}`].filter(Boolean).join("\n\n") }],
      });
      // Fonte sem link oficial não passa: o advogado precisa conseguir conferir.
      const fontes = (Array.isArray(dados.fontes) ? dados.fontes : []).flatMap((f) => {
        const url = oficial(f.url);
        const referencia = textoLimpo(f.referencia, 200);
        if (!url || !referencia) return [];
        const tipo = f.tipo === "legislacao" || f.tipo === "sumula" ? f.tipo : "jurisprudencia";
        const tribunal = textoLimpo(f.tribunal, 40);
        return [{ tipo, referencia, ...(tribunal ? { tribunal } : {}), resumo: textoLimpo(f.resumo, 1500) ?? "", url } as ResultadoPesquisa["fontes"][number]];
      });
      return { pergunta, resposta: textoLimpo(dados.resposta, 6000) ?? "", fontes: fontes.slice(0, 15), paginasConsultadas: fontesWeb.length, modelo: ia.modelo };
    } catch (e) {
      throw falhaDaIa("pesquisa", e, "A pesquisa nas fontes oficiais falhou agora. Tente de novo em alguns minutos.");
    }
  }
}
