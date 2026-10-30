import { blocoDosPadroes } from "../../lib/padroes.ts";
import { LIMITES_PROVIDENCIAS, type Providencia, type ProvidenciasDoProcesso, type SituacaoProvidencia } from "../../lib/providencias.ts";
import type { Clock } from "../core/clock.ts";
import { novoId } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import { nomeDoAutor, type RegistrosRepository, textoLimpo } from "../registros/registros.ts";
import { type ContextoProcesso, Exclusivo, falhaDaIa, fonteValida, semIa } from "./contexto-processo.ts";
import { perguntarJson, type ServicoIa } from "./ia.ts";
import type { PadroesService } from "./padroes.ts";

const INSTRUCOES = `Você lista as providências que o escritório precisa tomar num processo, a partir dos PDFs.
Inclua: atos processuais com prazo (contestar, recorrer, manifestar, cumprir decisão), documentos a pedir ao cliente, pagamentos de custas, audiências e perícias a preparar, condições de acordos.
Regras:
- Use só o que está nos documentos; cada providência aponta o documento (posição, começando em 1) e a página em que se apoia.
- Prazo em AAAA-MM-DD só quando o documento permite calcular com segurança; senão, deixe vazio.
- O fundamento é o artigo, cláusula ou decisão que pede a providência (curto), ou vazio.
- No máximo 25 providências, sem repetir as que já existem na lista enviada.`;

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["providencias"],
  properties: {
    providencias: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["descricao", "fundamento", "prazo", "documento", "pagina"],
        properties: {
          descricao: { type: "string" },
          fundamento: { type: "string" },
          prazo: { type: "string", description: "AAAA-MM-DD ou vazio." },
          documento: { type: "integer" },
          pagina: { type: "integer" },
        },
      },
    },
  },
};

type Valor = { itens: Providencia[] };

const dataValida = (d: unknown): d is string => typeof d === "string" && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d);
const SITUACOES: SituacaoProvidencia[] = ["pendente", "feita", "descartada"];

/** Lista de providências do processo: sugeridas pela IA a partir dos PDFs ou incluídas à mão. */
export class ProvidenciasService {
  private readonly repo: RegistrosRepository;
  private readonly contexto: ContextoProcesso;
  private readonly padroes: PadroesService;
  private readonly ia?: ServicoIa;
  private readonly clock: Clock;
  private readonly limitar: (usuarioId: string) => void;
  private readonly exclusivo = new Exclusivo();

  constructor(d: { repo: RegistrosRepository; contexto: ContextoProcesso; padroes: PadroesService; ia?: ServicoIa; clock: Clock; limitar?: (usuarioId: string) => void }) {
    this.repo = d.repo;
    this.contexto = d.contexto;
    this.padroes = d.padroes;
    this.ia = d.ia;
    this.clock = d.clock;
    this.limitar = d.limitar ?? (() => undefined);
  }

  get disponivel() {
    return !!this.ia;
  }

  private async registro(usuarioId: string, processoId: string) {
    const [r] = await this.repo.listar<Valor>(usuarioId, "providencias", { processoId });
    return r ?? null;
  }

  async obter(usuarioId: string, processoId: string): Promise<ProvidenciasDoProcesso> {
    await this.contexto.processo(usuarioId, processoId);
    const r = await this.registro(usuarioId, processoId);
    return { processoId, itens: r?.valor.itens ?? [], atualizadoEm: r?.atualizadoEm ?? "" };
  }

  /** Grava a lista inteira de uma vez, criando o registro na primeira vez. */
  private async mudar(usuarioId: string, processoId: string, fn: (itens: Providencia[]) => Providencia[]): Promise<ProvidenciasDoProcesso> {
    const agora = this.clock.agora().toISOString();
    const r = await this.registro(usuarioId, processoId);
    if (!r) {
      const itens = fn([]);
      await this.repo.gravar(usuarioId, { id: novoId(), tipo: "providencias", processoId, valor: { itens }, criadoEm: agora, atualizadoEm: agora });
      return { processoId, itens, atualizadoEm: agora };
    }
    const salvo = await this.repo.alterar<Valor>(usuarioId, "providencias", r.id, (atual) => ({ itens: fn(atual.valor.itens) }), agora);
    return { processoId, itens: salvo?.valor.itens ?? [], atualizadoEm: agora };
  }

  /** A IA lê os PDFs e acrescenta providências sugeridas (as que já existem ficam como estão). */
  async extrair(autor: { id: string; nome: string }, processoId: string): Promise<ProvidenciasDoProcesso & { novas: number }> {
    const ia = this.ia;
    if (!ia) throw semIa("A lista de providências");
    const ctx = await this.contexto.carregar(autor.id, processoId, { exigirPdf: true });
    return this.exclusivo.executar(processoId, "Já há uma leitura deste processo em andamento.", async () => {
      this.limitar(autor.id);
      const existentes = (await this.registro(autor.id, processoId))?.valor.itens ?? [];
      const padroes = await this.padroes.instrucoes(autor.id, "providencias");
      let brutos: unknown[];
      try {
        const { dados } = await perguntarJson<{ providencias: unknown[] }>(ia, {
          sistema: INSTRUCOES,
          esquema: ESQUEMA,
          blocos: [
            ...ctx.blocos,
            {
              tipo: "texto",
              texto: [
                existentes.length ? `Providências que já estão na lista:\n${existentes.map((p) => `- ${p.descricao}`).join("\n")}` : "",
                blocoDosPadroes(padroes),
                `Hoje é ${this.clock.agora().toISOString().slice(0, 10)}. Liste as providências.`,
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
          ],
        });
        brutos = Array.isArray(dados.providencias) ? dados.providencias : [];
      } catch (e) {
        throw falhaDaIa("providencias", e);
      }
      const agora = this.clock.agora().toISOString();
      const quem = nomeDoAutor(autor.nome);
      const ja = new Set(existentes.map((p) => p.descricao.toLowerCase()));
      const novas: Providencia[] = [];
      for (const b of brutos) {
        const { descricao, fundamento, prazo, documento, pagina } = (b ?? {}) as Record<string, unknown>;
        const texto = textoLimpo(descricao, LIMITES_PROVIDENCIAS.descricao);
        const fonte = fonteValida(ctx.documentos, documento, pagina);
        if (!texto || !fonte || ja.has(texto.toLowerCase())) continue;
        ja.add(texto.toLowerCase());
        const f = textoLimpo(fundamento, LIMITES_PROVIDENCIAS.fundamento);
        novas.push({
          id: novoId(),
          descricao: texto,
          ...(f ? { fundamento: f } : {}),
          fonte,
          ...(dataValida(prazo) ? { prazo } : {}),
          situacao: "pendente",
          sugerida: true,
          historico: [{ quando: agora, quem: `IA (${ia.modelo}) a pedido de ${quem}`, acao: "Sugerida a partir dos PDFs" }],
          criadoEm: agora,
        });
      }
      const r = await this.mudar(autor.id, processoId, (itens) => [...itens, ...novas].slice(0, LIMITES_PROVIDENCIAS.itens));
      return { ...r, novas: novas.length };
    });
  }

  async incluir(autor: { id: string; nome: string }, processoId: string, corpo: unknown): Promise<ProvidenciasDoProcesso> {
    await this.contexto.processo(autor.id, processoId);
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    const descricao = textoLimpo(c.descricao, LIMITES_PROVIDENCIAS.descricao);
    if (!descricao) throw new AppError("dados_invalidos", "Descreva a providência.", { campo: "descricao" });
    const agora = this.clock.agora().toISOString();
    const fundamento = textoLimpo(c.fundamento, LIMITES_PROVIDENCIAS.fundamento);
    const item: Providencia = {
      id: novoId(),
      descricao,
      ...(fundamento ? { fundamento } : {}),
      ...(dataValida(c.prazo) ? { prazo: c.prazo } : {}),
      ...(typeof c.responsavelId === "string" && c.responsavelId ? { responsavelId: c.responsavelId.slice(0, 64) } : {}),
      situacao: "pendente",
      sugerida: false,
      historico: [{ quando: agora, quem: nomeDoAutor(autor.nome), acao: "Incluída" }],
      criadoEm: agora,
    };
    return this.mudar(autor.id, processoId, (itens) => {
      if (itens.length >= LIMITES_PROVIDENCIAS.itens) throw new AppError("dados_invalidos", "Limite de providências deste processo.");
      return [...itens, item];
    });
  }

  /** Muda situação, prazo, responsável ou texto; cada mudança fica no histórico do item. */
  async alterar(autor: { id: string; nome: string }, processoId: string, itemId: string, corpo: unknown): Promise<ProvidenciasDoProcesso> {
    await this.contexto.processo(autor.id, processoId);
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    const agora = this.clock.agora().toISOString();
    const quem = nomeDoAutor(autor.nome);
    let achou = false;
    const r = await this.mudar(autor.id, processoId, (itens) =>
      itens.map((p) => {
        if (p.id !== itemId) return p;
        achou = true;
        const novo: Providencia = { ...p, sugerida: false };
        const acoes: string[] = [];
        if (SITUACOES.includes(c.situacao as SituacaoProvidencia) && c.situacao !== p.situacao) {
          novo.situacao = c.situacao as SituacaoProvidencia;
          acoes.push(`Marcada como ${novo.situacao}`);
        }
        if ("prazo" in c) {
          if (dataValida(c.prazo)) novo.prazo = c.prazo;
          else delete novo.prazo;
          if (novo.prazo !== p.prazo) acoes.push(novo.prazo ? `Prazo: ${novo.prazo}` : "Prazo removido");
        }
        if ("responsavelId" in c) {
          if (typeof c.responsavelId === "string" && c.responsavelId) novo.responsavelId = c.responsavelId.slice(0, 64);
          else delete novo.responsavelId;
          if (novo.responsavelId !== p.responsavelId) acoes.push(novo.responsavelId ? "Responsável alterado" : "Responsável removido");
        }
        const descricao = textoLimpo(c.descricao, LIMITES_PROVIDENCIAS.descricao);
        if (descricao && descricao !== p.descricao) {
          novo.descricao = descricao;
          acoes.push("Texto editado");
        }
        if (p.sugerida && !acoes.length) acoes.push("Sugestão confirmada");
        novo.historico = [...p.historico, ...acoes.map((acao) => ({ quando: agora, quem, acao }))].slice(-LIMITES_PROVIDENCIAS.historico);
        return novo;
      }),
    );
    if (!achou) throw new AppError("nao_encontrado", "Providência não encontrada.");
    return r;
  }

  async excluir(usuarioId: string, processoId: string, itemId: string): Promise<ProvidenciasDoProcesso> {
    await this.contexto.processo(usuarioId, processoId);
    let achou = false;
    const r = await this.mudar(usuarioId, processoId, (itens) => itens.filter((p) => (p.id === itemId ? ((achou = true), false) : true)));
    if (!achou) throw new AppError("nao_encontrado", "Providência não encontrada.");
    return r;
  }

  /** Pendentes de todos os processos do usuário, para a tela Hoje. */
  async pendentes(usuarioId: string): Promise<{ processoId: string; item: Providencia }[]> {
    const todos = await this.repo.listar<Valor>(usuarioId, "providencias");
    return todos.flatMap((r) => r.valor.itens.filter((p) => p.situacao === "pendente" && !p.sugerida).map((item) => ({ processoId: r.processoId!, item })));
  }
}
