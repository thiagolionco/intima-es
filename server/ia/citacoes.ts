import { createHash } from "node:crypto";
import { type CitacaoVerificada, extrairCitacoes, LIMITES_CITACOES, mesmaReferencia, type SituacaoCitacao, type VerificacaoCitacoes } from "../../lib/citacoes.ts";
import { blocoDosPadroes } from "../../lib/padroes.ts";
import type { Clock } from "../core/clock.ts";
import { novoId } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import type { BibliotecaService } from "../biblioteca/biblioteca.ts";
import { idValido, nomeDoAutor, type Registro, type RegistrosRepository } from "../registros/registros.ts";
import { type ContextoProcesso, falhaDaIa } from "./contexto-processo.ts";
import { DOMINIOS_OFICIAIS, perguntarJson, type ServicoIa } from "./ia.ts";
import type { PadroesService } from "./padroes.ts";

const INSTRUCOES = `Você confere citações jurídicas brasileiras para um escritório de advocacia.
Recebe uma lista de citações (súmulas, leis e artigos, precedentes e temas) tiradas de um parecer, com o trecho em que cada uma aparece.
Para cada citação, pesquise nas fontes oficiais (Planalto, STF, STJ, TST, tribunais) e diga:
- "confirmada": existe, está em vigor (não foi revogada, cancelada ou superada) e o conteúdo apoia o uso feito no trecho.
- "divergente": existe, mas foi revogada, cancelada, superada, tem outro número, ou o conteúdo não diz o que o trecho afirma.
- "nao_encontrada": não achou nas fontes oficiais.
No comentário, em até 2 frases, diga o que a fonte diz de fato ou o que mudou. Indique a URL oficial consultada.
Não invente: sem fonte oficial que confirme, não marque "confirmada".`;

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["citacoes"],
  properties: {
    citacoes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["indice", "situacao", "comentario", "url"],
        properties: {
          indice: { type: "integer", description: "Posição da citação na lista, começando em 1." },
          situacao: { type: "string", enum: ["confirmada", "divergente", "nao_encontrada"] },
          comentario: { type: "string" },
          url: { type: "string", description: "URL da fonte oficial consultada, ou vazio." },
        },
      },
    },
  },
};

type Bruto = { citacoes: { indice: number; situacao: SituacaoCitacao; comentario: string; url: string }[] };
type ValorVerificacao = Omit<VerificacaoCitacoes, "id" | "processoId" | "criadoEm">;

const hash = (t: string) => createHash("sha256").update(t.replace(/\r\n/g, "\n").trim()).digest("hex");

/** Trecho em volta da primeira ocorrência, para a IA ver o uso feito. */
function trecho(texto: string, citacao: string): string {
  const i = texto.indexOf(citacao);
  if (i < 0) return "";
  return texto.slice(Math.max(0, i - 280), i + citacao.length + 280).replace(/\s+/g, " ").trim();
}

const urlOficial = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && DOMINIOS_OFICIAIS.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`)) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Verificador de citações: acha cada lei, súmula e precedente do texto, confere na biblioteca do
 * escritório e, com a IA ligada, pesquisa nas fontes oficiais. Guarda o resultado por processo.
 */
export class CitacoesService {
  private readonly repo: RegistrosRepository;
  private readonly biblioteca: BibliotecaService;
  private readonly contexto: ContextoProcesso;
  private readonly padroes: PadroesService;
  private readonly ia?: ServicoIa;
  private readonly clock: Clock;
  private readonly limitar: (usuarioId: string) => void;

  constructor(d: { repo: RegistrosRepository; biblioteca: BibliotecaService; contexto: ContextoProcesso; padroes: PadroesService; ia?: ServicoIa; clock: Clock; limitar?: (usuarioId: string) => void }) {
    this.repo = d.repo;
    this.biblioteca = d.biblioteca;
    this.contexto = d.contexto;
    this.padroes = d.padroes;
    this.ia = d.ia;
    this.clock = d.clock;
    this.limitar = d.limitar ?? (() => undefined);
  }

  get pesquisaDisponivel() {
    return !!this.ia;
  }

  /** A verificação mais nova do processo, ou null. */
  async ultima(usuarioId: string, processoId: string): Promise<VerificacaoCitacoes | null> {
    await this.contexto.processo(usuarioId, processoId);
    const [r] = (await this.repo.listar<ValorVerificacao>(usuarioId, "verificacao", { processoId })).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    return r ? { ...r.valor, id: r.id, processoId, criadoEm: r.criadoEm } : null;
  }

  /**
   * Verifica o texto. `pesquisar: false` confere só na biblioteca (sem custo de IA). Com processo,
   * guarda o resultado (só o mais novo fica); sem processo, só devolve.
   */
  async verificar(autor: { id: string; nome: string }, corpo: unknown): Promise<VerificacaoCitacoes> {
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as { texto?: unknown; processoId?: unknown; pesquisar?: unknown };
    const texto = typeof c.texto === "string" ? c.texto.replace(/\r\n/g, "\n").trim() : "";
    if (!texto) throw new AppError("dados_invalidos", "Não há texto para verificar.");
    if (texto.length > LIMITES_CITACOES.texto) throw new AppError("dados_invalidos", "O texto é grande demais para verificar de uma vez.");
    const processoId = idValido(c.processoId) ? c.processoId : undefined;
    if (c.processoId !== undefined && !processoId) throw new AppError("nao_encontrado", "Processo não encontrado.");
    if (processoId) await this.contexto.processo(autor.id, processoId);

    const encontradas = extrairCitacoes(texto);
    const itens = (await this.biblioteca.listar(autor.id)).filter((i) => i.referencia);
    const citacoes: CitacaoVerificada[] = encontradas.map((e) => {
      const item = itens.find((i) => mesmaReferencia(e.texto, i.referencia!));
      return item ? { ...e, situacao: "na_biblioteca", bibliotecaId: item.id, comentario: `Item "${item.titulo}" da biblioteca.` } : { ...e, situacao: "nao_verificada" };
    });

    const ia = this.ia;
    const pesquisar = c.pesquisar !== false && !!ia && citacoes.length > 0;
    if (pesquisar && ia) {
      this.limitar(autor.id);
      const padroes = await this.padroes.instrucoes(autor.id, "citacoes");
      const lista = citacoes.map((x, i) => `${i + 1}. ${x.texto}\n   Trecho: "${trecho(texto, x.texto)}"`).join("\n");
      try {
        const { dados, fontesWeb } = await perguntarJson<Bruto>(ia, {
          sistema: INSTRUCOES,
          esquema: ESQUEMA,
          pesquisaWeb: { maxUsos: Math.min(20, citacoes.length * 2 + 2), dominios: DOMINIOS_OFICIAIS },
          esforco: "medium",
          blocos: [{ tipo: "texto", texto: `Citações para conferir:\n${lista}${padroes ? `\n\n${blocoDosPadroes(padroes)}` : ""}` }],
        });
        for (const v of dados.citacoes ?? []) {
          const alvo = citacoes[v.indice - 1];
          if (!alvo || !["confirmada", "divergente", "nao_encontrada"].includes(v.situacao)) continue;
          const url = urlOficial(v.url);
          const titulo = url ? (fontesWeb.find((f) => f.url === url)?.titulo ?? new URL(url).hostname) : undefined;
          // A biblioteca não anula um "divergente" da fonte oficial; um "confirmada" vale mais que a biblioteca.
          if (alvo.situacao === "na_biblioteca" && v.situacao === "nao_encontrada") continue;
          Object.assign(alvo, { situacao: v.situacao, comentario: v.comentario.trim().slice(0, 600) || alvo.comentario }, url && titulo ? { fonte: { titulo: titulo.slice(0, 200), url } } : {});
        }
      } catch (e) {
        throw falhaDaIa("citacoes", e, "A pesquisa nas fontes oficiais falhou agora. Tente de novo em alguns minutos.");
      }
    }

    const agora = this.clock.agora().toISOString();
    const valor: ValorVerificacao = {
      hashTexto: hash(texto),
      citacoes,
      pesquisaOficial: pesquisar,
      ...(pesquisar && ia ? { modelo: ia.modelo } : {}),
      autorNome: nomeDoAutor(autor.nome),
    };
    const id = novoId();
    if (processoId) {
      // Só a mais nova importa: apaga as anteriores do processo.
      for (const antiga of await this.repo.listar(autor.id, "verificacao", { processoId })) await this.repo.excluir(autor.id, "verificacao", antiga.id);
      const r: Registro<ValorVerificacao> = { id, tipo: "verificacao", processoId, valor, criadoEm: agora, atualizadoEm: agora };
      await this.repo.gravar(autor.id, r);
    }
    return { ...valor, id, ...(processoId ? { processoId } : {}), criadoEm: agora };
  }
}

export const hashDoTexto = hash;
