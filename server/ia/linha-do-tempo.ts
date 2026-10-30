import { type FatoProcesso, type FatosDoProcesso, LIMITES_NOTA, type NotaProcesso, TIPO_NOTA_LABEL } from "../../lib/linha-do-tempo.ts";
import { blocoDosPadroes } from "../../lib/padroes.ts";
import type { Clock } from "../core/clock.ts";
import { novoId } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import { idValido, nomeDoAutor, type Registro, type RegistrosRepository, textoLimpo } from "../registros/registros.ts";
import { type ContextoProcesso, Exclusivo, falhaDaIa, fonteValida, semIa } from "./contexto-processo.ts";
import { perguntarJson, type ServicoIa } from "./ia.ts";
import type { PadroesService } from "./padroes.ts";

const INSTRUCOES_FATOS = `Você monta a cronologia de um processo para o escritório que representa o cliente.
Leia os PDFs e liste os fatos com data que importam para o caso: contratos, pagamentos, notificações, decisões, citações, audiências, perícias, prazos.
Regras:
- Use só o que está nos documentos. Não invente datas: sem data no documento, não inclua o fato.
- Data em AAAA-MM-DD; se o documento só der mês e ano, AAAA-MM.
- Cada fato aponta o documento (posição na lista, começando em 1) e a página do PDF em que aparece.
- Uma frase por fato, no passado, com valores quando houver. No máximo 60 fatos, sem repetir.`;

const ESQUEMA_FATOS = {
  type: "object",
  additionalProperties: false,
  required: ["fatos"],
  properties: {
    fatos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["data", "descricao", "documento", "pagina"],
        properties: { data: { type: "string" }, descricao: { type: "string" }, documento: { type: "integer" }, pagina: { type: "integer" } },
      },
    },
  },
};

const INSTRUCOES_NOTA = `Você resume, para o advogado, um e-mail ou anotação colada no processo.
Responda com um resumo de até 3 frases e as próximas ações que o texto pede (no máximo 5, cada uma começando por um verbo). Sem ações, devolva a lista vazia.
Use só o que está no texto.`;

const ESQUEMA_NOTA = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "acoes"],
  properties: { resumo: { type: "string" }, acoes: { type: "array", items: { type: "string" } } },
};

type ValorFatos = Omit<FatosDoProcesso, "processoId" | "criadoEm">;
type ValorNota = Omit<NotaProcesso, "id" | "processoId" | "criadoEm">;

const dataValida = (d: unknown): d is string => typeof d === "string" && /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/.test(d);

/** Fatos com data e página válidas, sem repetir e em ordem de data. */
export function normalizarFatos(bruto: unknown, documentos: { id: string; nome: string }[]): FatoProcesso[] {
  const lista = (bruto && typeof bruto === "object" ? (bruto as { fatos?: unknown }).fatos : undefined) ?? [];
  const vistos = new Set<string>();
  const saida: FatoProcesso[] = [];
  for (const f of Array.isArray(lista) ? lista : []) {
    const { data, descricao, documento, pagina } = (f ?? {}) as Record<string, unknown>;
    const fonte = fonteValida(documentos, documento, pagina);
    const texto = textoLimpo(descricao, 500);
    if (!fonte || !texto || !dataValida(data)) continue;
    const chave = `${data}|${texto.toLowerCase()}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({ data, descricao: texto, ...fonte });
  }
  return saida.sort((a, b) => a.data.localeCompare(b.data)).slice(0, 80);
}

const paraNota = (r: Registro<ValorNota>): NotaProcesso => ({ ...r.valor, id: r.id, processoId: r.processoId!, criadoEm: r.criadoEm });

/** Linha do tempo: fatos tirados dos PDFs pela IA e e-mails ou anotações coladas no processo. */
export class LinhaDoTempoService {
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

  async fatos(usuarioId: string, processoId: string): Promise<FatosDoProcesso | null> {
    await this.contexto.processo(usuarioId, processoId);
    const [r] = await this.repo.listar<ValorFatos>(usuarioId, "fatos", { processoId });
    return r ? { ...r.valor, processoId, criadoEm: r.criadoEm } : null;
  }

  /** Lê os PDFs e grava os fatos (substitui a extração anterior). */
  async extrairFatos(autor: { id: string; nome: string }, processoId: string): Promise<FatosDoProcesso> {
    const ia = this.ia;
    if (!ia) throw semIa("A linha do tempo");
    const ctx = await this.contexto.carregar(autor.id, processoId, { exigirPdf: true });
    return this.exclusivo.executar(processoId, "Já há uma leitura deste processo em andamento.", async () => {
      this.limitar(autor.id);
      const padroes = await this.padroes.instrucoes(autor.id, "linha_do_tempo");
      let fatos: FatoProcesso[];
      try {
        const { dados } = await perguntarJson(ia, {
          sistema: INSTRUCOES_FATOS,
          esquema: ESQUEMA_FATOS,
          blocos: [...ctx.blocos, { tipo: "texto", texto: `${padroes ? `${blocoDosPadroes(padroes)}\n\n` : ""}Liste os fatos com data.` }],
        });
        fatos = normalizarFatos(dados, ctx.documentos);
      } catch (e) {
        throw falhaDaIa("linha-do-tempo", e);
      }
      const agora = this.clock.agora().toISOString();
      const valor: ValorFatos = { fatos, documentos: ctx.documentos, modelo: ia.modelo, autorNome: nomeDoAutor(autor.nome) };
      const [antigo] = await this.repo.listar(autor.id, "fatos", { processoId });
      await this.repo.gravar(autor.id, { id: antigo?.id ?? novoId(), tipo: "fatos", processoId, valor, criadoEm: agora, atualizadoEm: agora });
      return { ...valor, processoId, criadoEm: agora };
    });
  }

  /** Mais novas primeiro. */
  async notas(usuarioId: string, processoId: string): Promise<NotaProcesso[]> {
    await this.contexto.processo(usuarioId, processoId);
    return (await this.repo.listar<ValorNota>(usuarioId, "nota", { processoId })).map(paraNota).sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
  }

  /** Cola um e-mail ou anotação; com a IA ligada e `resumir`, já vem com resumo e próximas ações. */
  async criarNota(autor: { id: string; nome: string }, processoId: string, corpo: unknown): Promise<NotaProcesso> {
    await this.contexto.processo(autor.id, processoId);
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    const tipo = (Object.keys(TIPO_NOTA_LABEL) as NotaProcesso["tipo"][]).includes(c.tipo as NotaProcesso["tipo"]) ? (c.tipo as NotaProcesso["tipo"]) : "anotacao";
    const texto = textoLimpo(c.texto, LIMITES_NOTA.texto);
    if (!texto) throw new AppError("dados_invalidos", "Cole o texto do e-mail ou escreva a anotação.", { campo: "texto" });
    if (typeof c.texto === "string" && c.texto.length > LIMITES_NOTA.texto) throw new AppError("dados_invalidos", "O texto é grande demais.", { campo: "texto" });
    const hoje = this.clock.agora().toISOString().slice(0, 10);
    const data = dataValida(c.data) && c.data.length === 10 ? c.data : hoje;
    const titulo = textoLimpo(c.titulo, LIMITES_NOTA.titulo) ?? texto.split("\n")[0].slice(0, 80);
    if ((await this.repo.listar(autor.id, "nota", { processoId })).length >= LIMITES_NOTA.porProcesso) throw new AppError("dados_invalidos", "Limite de anotações deste processo.");

    let resumo: string | undefined;
    let acoes: string[] | undefined;
    const ia = this.ia;
    if (ia && c.resumir === true) {
      this.limitar(autor.id);
      try {
        const { dados } = await perguntarJson<{ resumo: string; acoes: string[] }>(ia, {
          sistema: INSTRUCOES_NOTA,
          esquema: ESQUEMA_NOTA,
          esforco: "low",
          simples: true,
          blocos: [{ tipo: "documento", titulo: `${TIPO_NOTA_LABEL[tipo]}: ${titulo}`, texto }, { tipo: "texto", texto: "Resuma e liste as próximas ações." }],
        });
        resumo = textoLimpo(dados.resumo, 800);
        acoes = (Array.isArray(dados.acoes) ? dados.acoes : []).flatMap((a) => textoLimpo(a, 300) ?? []).slice(0, 5);
      } catch (e) {
        // A anotação vale sem o resumo: grava assim mesmo.
        console.error("[notas] resumo falhou:", e instanceof Error ? e.message : e);
      }
    }
    const agora = this.clock.agora().toISOString();
    const r: Registro<ValorNota> = {
      id: novoId(),
      tipo: "nota",
      processoId,
      valor: {
        tipo,
        data,
        titulo,
        texto,
        ...(resumo ? { resumo } : {}),
        ...(acoes?.length ? { acoes } : {}),
        visivelAoCliente: c.visivelAoCliente === true,
        autorId: autor.id,
        autorNome: nomeDoAutor(autor.nome),
      },
      criadoEm: agora,
      atualizadoEm: agora,
    };
    await this.repo.gravar(autor.id, r);
    return paraNota(r);
  }

  /** Só muda se a nota aparece no portal do cliente. */
  async alterarNota(usuarioId: string, processoId: string, id: string, corpo: unknown): Promise<NotaProcesso> {
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as { visivelAoCliente?: unknown };
    const atual = idValido(id) ? await this.repo.obter<ValorNota>(usuarioId, "nota", id) : null;
    if (!atual || atual.processoId !== processoId) throw new AppError("nao_encontrado", "Anotação não encontrada.");
    const salvo = await this.repo.alterar<ValorNota>(usuarioId, "nota", id, (r) => ({ ...r.valor, visivelAoCliente: c.visivelAoCliente === true }), this.clock.agora().toISOString());
    if (!salvo) throw new AppError("nao_encontrado", "Anotação não encontrada.");
    return paraNota(salvo);
  }

  async excluirNota(usuarioId: string, processoId: string, id: string) {
    const atual = idValido(id) ? await this.repo.obter<ValorNota>(usuarioId, "nota", id) : null;
    if (!atual || atual.processoId !== processoId) throw new AppError("nao_encontrado", "Anotação não encontrada.");
    await this.repo.excluir(usuarioId, "nota", id);
  }
}
