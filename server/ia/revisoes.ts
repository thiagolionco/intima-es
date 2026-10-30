import { blocoDosPadroes } from "../../lib/padroes.ts";
import { referencia } from "../../lib/processos.ts";
import {
  type CelulaRevisao,
  type FormatoPergunta,
  FORMATO_PERGUNTA_LABEL,
  LIMITES_REVISAO,
  type LinhaRevisao,
  type ModeloRevisao,
  type PerguntaRevisao,
  type RevisaoTabela,
} from "../../lib/revisao.ts";
import { formatProcesso } from "../../lib/utils.ts";
import type { Clock } from "../core/clock.ts";
import { novoId } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import type { ProcessoRepository } from "../processos/processos.ts";
import { idValido, nomeDoAutor, type Registro, type RegistrosRepository, textoLimpo } from "../registros/registros.ts";
import { type ContextoProcesso, Exclusivo, falhaDaIa, fonteValida, semIa } from "./contexto-processo.ts";
import { perguntarJson, type ServicoIa } from "./ia.ts";
import type { PadroesService } from "./padroes.ts";

const INSTRUCOES = `Você preenche uma tabela de revisão de processos para um escritório de advocacia.
Recebe os PDFs de um processo e uma lista de perguntas, cada uma com o formato da resposta.
Regras:
- Responda só com o que está nos documentos e nos dados do processo. Sem apoio, responda "Não consta" e deixe a fonte vazia (documento 0, página 0).
- Formatos: "Sim ou não" → "Sim" ou "Não"; "Data" → DD/MM/AAAA; "Valor em R$" → R$ 1.234,56; "Baixo, médio ou alto" → Baixo, Médio ou Alto; "Texto curto" → até 2 frases.
- Para cada resposta, aponte o documento (posição na lista, começando em 1) e a página do PDF, e explique em uma frase por que respondeu assim.`;

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["respostas"],
  properties: {
    respostas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pergunta", "resposta", "justificativa", "documento", "pagina"],
        properties: {
          pergunta: { type: "integer", description: "Posição da pergunta, começando em 1." },
          resposta: { type: "string" },
          justificativa: { type: "string" },
          documento: { type: "integer" },
          pagina: { type: "integer" },
        },
      },
    },
  },
};

const INSTRUCOES_PERGUNTA = `Você analisa uma tabela de revisão de processos de um escritório de advocacia e responde à pergunta do advogado sobre ela.
Use só o que está na tabela. Cite os processos pelo rótulo. Seja objetivo, em até 10 frases ou uma lista curta.`;

type ValorRevisao = Omit<RevisaoTabela, "id" | "criadoEm" | "atualizadoEm">;
type ValorModelo = Omit<ModeloRevisao, "id" | "criadoEm">;

const FORMATOS = Object.keys(FORMATO_PERGUNTA_LABEL) as FormatoPergunta[];
const naoEncontrada = () => new AppError("nao_encontrado", "Revisão não encontrada.");

/** Perguntas válidas; as que já existem mantêm o id (para não perder as respostas). */
function lerPerguntas(v: unknown, atuais: PerguntaRevisao[] = []): PerguntaRevisao[] {
  const lista = Array.isArray(v) ? v : [];
  const saida: PerguntaRevisao[] = [];
  for (const p of lista) {
    const { id, texto, formato } = (p ?? {}) as Record<string, unknown>;
    const t = textoLimpo(texto, LIMITES_REVISAO.pergunta);
    if (!t) continue;
    const existente = typeof id === "string" ? atuais.find((a) => a.id === id) : undefined;
    saida.push({ id: existente?.id ?? novoId(), texto: t, formato: FORMATOS.includes(formato as FormatoPergunta) ? (formato as FormatoPergunta) : "texto" });
  }
  if (!saida.length) throw new AppError("dados_invalidos", "Escreva ao menos uma pergunta.", { campo: "perguntas" });
  if (saida.length > LIMITES_REVISAO.perguntas) throw new AppError("dados_invalidos", `Use até ${LIMITES_REVISAO.perguntas} perguntas.`, { campo: "perguntas" });
  return saida;
}

const paraRevisao = (r: Registro<ValorRevisao>): RevisaoTabela => ({ ...r.valor, id: r.id, criadoEm: r.criadoEm, atualizadoEm: r.atualizadoEm });

/** Revisão de vários processos numa tabela (perguntas nas colunas, processos nas linhas). */
export class RevisoesService {
  private readonly repo: RegistrosRepository;
  private readonly processos: ProcessoRepository;
  private readonly contexto: ContextoProcesso;
  private readonly padroes: PadroesService;
  private readonly ia?: ServicoIa;
  private readonly clock: Clock;
  private readonly limitar: (usuarioId: string) => void;
  private readonly exclusivo = new Exclusivo();

  constructor(d: {
    repo: RegistrosRepository;
    processos: ProcessoRepository;
    contexto: ContextoProcesso;
    padroes: PadroesService;
    ia?: ServicoIa;
    clock: Clock;
    limitar?: (usuarioId: string) => void;
  }) {
    this.repo = d.repo;
    this.processos = d.processos;
    this.contexto = d.contexto;
    this.padroes = d.padroes;
    this.ia = d.ia;
    this.clock = d.clock;
    this.limitar = d.limitar ?? (() => undefined);
  }

  get disponivel() {
    return !!this.ia;
  }

  /** Esconde as linhas de processos que o usuário não vê (particulares de outra pessoa). */
  private async visivel(usuarioId: string, r: RevisaoTabela): Promise<RevisaoTabela> {
    const vistos = new Set((await this.processos.listar(usuarioId)).map((p) => p.id));
    return { ...r, linhas: r.linhas.filter((l) => vistos.has(l.processoId)) };
  }

  private async exigir(usuarioId: string, id: string): Promise<Registro<ValorRevisao>> {
    const r = idValido(id) ? await this.repo.obter<ValorRevisao>(usuarioId, "revisao", id) : null;
    if (!r) throw naoEncontrada();
    return r;
  }

  async listar(usuarioId: string): Promise<RevisaoTabela[]> {
    const lista = (await this.repo.listar<ValorRevisao>(usuarioId, "revisao")).map(paraRevisao).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
    const vistos = new Set((await this.processos.listar(usuarioId)).map((p) => p.id));
    return lista.map((r) => ({ ...r, linhas: r.linhas.filter((l) => vistos.has(l.processoId)) }));
  }

  async obter(usuarioId: string, id: string): Promise<RevisaoTabela> {
    return this.visivel(usuarioId, paraRevisao(await this.exigir(usuarioId, id)));
  }

  private async linhasDe(usuarioId: string, ids: unknown, atuais: LinhaRevisao[] = []): Promise<LinhaRevisao[]> {
    const pedidos = Array.isArray(ids) ? [...new Set(ids.filter(idValido))] : [];
    if (!pedidos.length) throw new AppError("dados_invalidos", "Escolha ao menos um processo.", { campo: "processos" });
    if (pedidos.length > LIMITES_REVISAO.linhas) throw new AppError("dados_invalidos", `Escolha até ${LIMITES_REVISAO.linhas} processos.`, { campo: "processos" });
    const todos = new Map((await this.processos.listar(usuarioId)).map((p) => [p.id, p]));
    return pedidos.flatMap((id) => {
      const existente = atuais.find((l) => l.processoId === id);
      if (existente) return [existente];
      const p = todos.get(id);
      return p ? [{ processoId: id, rotulo: p.numero ? `${formatProcesso(p.numero)} · ${referencia(p)}` : referencia(p), celulas: {} }] : [];
    });
  }

  async criar(autor: { id: string; nome: string }, corpo: unknown): Promise<RevisaoTabela> {
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    const titulo = textoLimpo(c.titulo, LIMITES_REVISAO.titulo) ?? "Revisão sem título";
    const perguntas = lerPerguntas(c.perguntas);
    const linhas = await this.linhasDe(autor.id, c.processos);
    if (!linhas.length) throw new AppError("dados_invalidos", "Nenhum dos processos escolhidos foi encontrado.", { campo: "processos" });
    if ((await this.repo.listar(autor.id, "revisao")).length >= LIMITES_REVISAO.porEscritorio) throw new AppError("dados_invalidos", "Limite de revisões do escritório. Exclua as antigas.");
    const agora = this.clock.agora().toISOString();
    const r: Registro<ValorRevisao> = {
      id: novoId(),
      tipo: "revisao",
      valor: { titulo, perguntas, linhas, autorId: autor.id, autorNome: nomeDoAutor(autor.nome) },
      criadoEm: agora,
      atualizadoEm: agora,
    };
    await this.repo.gravar(autor.id, r);
    return this.visivel(autor.id, paraRevisao(r));
  }

  /** Troca título, perguntas e processos. Respostas de perguntas e processos mantidos ficam. */
  async atualizar(usuarioId: string, id: string, corpo: unknown): Promise<RevisaoTabela> {
    const atual = await this.exigir(usuarioId, id);
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    const perguntas = "perguntas" in c ? lerPerguntas(c.perguntas, atual.valor.perguntas) : atual.valor.perguntas;
    const vistos = new Set((await this.processos.listar(usuarioId)).map((p) => p.id));
    // Linhas de processos que este usuário não vê continuam lá para quem vê.
    const escondidas = atual.valor.linhas.filter((l) => !vistos.has(l.processoId));
    const linhas = "processos" in c ? [...(await this.linhasDe(usuarioId, c.processos, atual.valor.linhas)), ...escondidas] : atual.valor.linhas;
    const ids = new Set(perguntas.map((p) => p.id));
    const salvo = await this.repo.alterar<ValorRevisao>(
      usuarioId,
      "revisao",
      id,
      (r) => ({
        ...r.valor,
        titulo: textoLimpo(c.titulo, LIMITES_REVISAO.titulo) ?? r.valor.titulo,
        perguntas,
        linhas: linhas.map((l) => ({ ...l, celulas: Object.fromEntries(Object.entries(l.celulas).filter(([k]) => ids.has(k))) })),
      }),
      this.clock.agora().toISOString(),
    );
    if (!salvo) throw naoEncontrada();
    return this.visivel(usuarioId, paraRevisao(salvo));
  }

  async excluir(usuarioId: string, id: string) {
    await this.exigir(usuarioId, id);
    await this.repo.excluir(usuarioId, "revisao", id);
  }

  /** Preenche a linha de um processo (uma chamada por processo, para a tela mostrar o andamento). */
  async executar(autor: { id: string; nome: string }, id: string, processoId: string): Promise<LinhaRevisao> {
    const ia = this.ia;
    if (!ia) throw semIa("A revisão em tabela");
    const atual = await this.exigir(autor.id, id);
    const linha = atual.valor.linhas.find((l) => l.processoId === processoId);
    if (!linha) throw new AppError("nao_encontrado", "Este processo não está na tabela.");
    const perguntas = atual.valor.perguntas.filter((p) => !linha.celulas[p.id]?.travada);
    if (!perguntas.length) return linha;
    return this.exclusivo.executar(`${id}:${processoId}`, "Esta linha já está sendo preenchida.", async () => {
      const ctx = await this.contexto.carregar(autor.id, processoId);
      this.limitar(autor.id);
      const padroes = await this.padroes.instrucoes(autor.id, "tabela");
      const agora = this.clock.agora().toISOString();
      const celulas: Record<string, CelulaRevisao> = {};
      let erro: string | undefined;
      try {
        const { dados } = await perguntarJson<{ respostas: { pergunta: number; resposta: string; justificativa: string; documento: number; pagina: number }[] }>(ia, {
          sistema: INSTRUCOES,
          esquema: ESQUEMA,
          esforco: "medium",
          blocos: [
            ...ctx.blocos,
            {
              tipo: "texto",
              texto: `${padroes ? `${blocoDosPadroes(padroes)}\n\n` : ""}Perguntas:\n${perguntas.map((p, i) => `${i + 1}. ${p.texto} (formato: ${FORMATO_PERGUNTA_LABEL[p.formato]})`).join("\n")}`,
            },
          ],
        });
        for (const [i, p] of perguntas.entries()) {
          const r = dados.respostas?.find((x) => x.pergunta === i + 1);
          const resposta = textoLimpo(r?.resposta, LIMITES_REVISAO.resposta);
          const fonte = r ? fonteValida(ctx.documentos, r.documento, r.pagina) : undefined;
          const justificativa = textoLimpo(r?.justificativa, LIMITES_REVISAO.justificativa);
          const semApoio = !resposta || /^n[ãa]o consta/i.test(resposta);
          celulas[p.id] = {
            resposta: resposta ?? "Não consta",
            ...(justificativa ? { justificativa } : {}),
            ...(fonte && !semApoio ? { fonte } : {}),
            estado: semApoio ? "sem_resposta" : "pronta",
          };
        }
      } catch (e) {
        const falha = falhaDaIa("revisao", e);
        erro = falha.message;
        for (const p of perguntas) celulas[p.id] = { resposta: "", estado: "erro" };
      }
      const salvo = await this.repo.alterar<ValorRevisao>(
        autor.id,
        "revisao",
        id,
        (r) => ({
          ...r.valor,
          modelo: ia.modelo,
          linhas: r.valor.linhas.map((l) => {
            if (l.processoId !== processoId) return l;
            // Célula travada no meio da execução continua como estava.
            const mantidas = Object.fromEntries(Object.entries(l.celulas).filter(([, c]) => c.travada));
            const { erro: _e, ...resto } = l;
            return { ...resto, celulas: { ...l.celulas, ...celulas, ...mantidas }, executadaEm: agora, ...(erro ? { erro } : {}) };
          }),
        }),
        agora,
      );
      const nova = salvo?.valor.linhas.find((l) => l.processoId === processoId);
      if (!nova) throw naoEncontrada();
      return nova;
    });
  }

  /** Edita uma célula à mão, marca como conferida ou trava contra a IA. */
  async alterarCelula(autor: { id: string; nome: string }, id: string, processoId: string, perguntaId: string, corpo: unknown): Promise<CelulaRevisao> {
    await this.contexto.processo(autor.id, processoId);
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as { resposta?: unknown; revisada?: unknown; travada?: unknown };
    const agora = this.clock.agora().toISOString();
    const quem = nomeDoAutor(autor.nome);
    let celula: CelulaRevisao | undefined;
    const salvo = await this.repo.alterar<ValorRevisao>(
      autor.id,
      "revisao",
      id,
      (r) => {
        if (!r.valor.perguntas.some((p) => p.id === perguntaId)) return null;
        return {
          ...r.valor,
          linhas: r.valor.linhas.map((l) => {
            if (l.processoId !== processoId) return l;
            const atual: CelulaRevisao = l.celulas[perguntaId] ?? { resposta: "", estado: "pendente" };
            const nova: CelulaRevisao = { ...atual };
            if (typeof c.resposta === "string") {
              nova.resposta = textoLimpo(c.resposta, LIMITES_REVISAO.resposta) ?? "";
              nova.editadaPor = quem;
              nova.estado = nova.resposta ? "pronta" : "pendente";
            }
            if (typeof c.revisada === "boolean") {
              if (c.revisada) nova.revisada = { por: quem, em: agora };
              else delete nova.revisada;
            }
            if (typeof c.travada === "boolean") {
              if (c.travada) nova.travada = true;
              else delete nova.travada;
            }
            celula = nova;
            return { ...l, celulas: { ...l.celulas, [perguntaId]: nova } };
          }),
        };
      },
      agora,
    );
    if (!salvo || !celula) throw new AppError("nao_encontrado", "Célula não encontrada.");
    return celula;
  }

  /** Pergunta livre sobre a tabela já preenchida (por exemplo, "quais têm risco alto e tutela?"). */
  async perguntar(autor: { id: string; nome: string }, id: string, corpo: unknown): Promise<{ resposta: string }> {
    const ia = this.ia;
    if (!ia) throw semIa("A revisão em tabela");
    const pergunta = textoLimpo((corpo as { pergunta?: unknown } | null)?.pergunta, 1000);
    if (!pergunta) throw new AppError("dados_invalidos", "Escreva a pergunta.", { campo: "pergunta" });
    const r = await this.obter(autor.id, id);
    this.limitar(autor.id);
    const tabela = r.linhas
      .map((l) => `## ${l.rotulo}\n${r.perguntas.map((p) => `- ${p.texto}: ${l.celulas[p.id]?.resposta || "(sem resposta)"}`).join("\n")}`)
      .join("\n\n");
    try {
      const resposta = await ia.perguntar({
        sistema: INSTRUCOES_PERGUNTA,
        esforco: "medium",
        blocos: [{ tipo: "documento", titulo: `Tabela: ${r.titulo}`, texto: tabela }, { tipo: "texto", texto: pergunta }],
      });
      return { resposta: resposta.texto.trim() };
    } catch (e) {
      throw falhaDaIa("revisao", e);
    }
  }

  async listarModelos(usuarioId: string): Promise<ModeloRevisao[]> {
    return (await this.repo.listar<ValorModelo>(usuarioId, "modelo_revisao")).map((r) => ({ ...r.valor, id: r.id, criadoEm: r.criadoEm })).sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
  }

  async salvarModelo(autor: { id: string; nome: string }, corpo: unknown): Promise<ModeloRevisao> {
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    const titulo = textoLimpo(c.titulo, LIMITES_REVISAO.titulo);
    if (!titulo) throw new AppError("dados_invalidos", "Dê um nome ao modelo.", { campo: "titulo" });
    const perguntas = lerPerguntas(c.perguntas).map(({ texto, formato }) => ({ texto, formato }));
    const agora = this.clock.agora().toISOString();
    const r: Registro<ValorModelo> = { id: novoId(), tipo: "modelo_revisao", valor: { titulo, perguntas, autorNome: nomeDoAutor(autor.nome) }, criadoEm: agora, atualizadoEm: agora };
    await this.repo.gravar(autor.id, r);
    return { ...r.valor, id: r.id, criadoEm: agora };
  }

  async excluirModelo(usuarioId: string, id: string) {
    if (!idValido(id) || !(await this.repo.excluir(usuarioId, "modelo_revisao", id))) throw new AppError("nao_encontrado", "Modelo não encontrado.");
  }
}
