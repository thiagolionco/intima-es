import { ehEtapa, indiceEtapa, modeloDoItem, proximaEtapa } from "../../lib/fluxo/etapas.ts";
import { type EventoFluxo, type FluxoProcesso, fluxoEfetivo, LIMITES_FLUXO } from "../../lib/fluxo/modelo.ts";
import type { MotorDeFluxo } from "../../lib/fluxo/motor.ts";
import type { DadosProcesso, FaseProcesso, Processo } from "../../lib/processos.ts";
import type { Clock } from "../core/clock.ts";
import { novoId } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import type { ArmazenamentoDocumentos } from "../infra/armazenamento.ts";
import type { ProcessoRepository } from "../processos/processos.ts";

/** Pedido de mudança de etapa já aprovado pelo motor, pronto para gravar de uma vez. */
export interface GravacaoTransicao {
  processo: Processo;
  de: FaseProcesso;
  para: FaseProcesso;
  /** Versão que quem pediu tinha na tela; outra gravação no meio recusa esta. */
  versaoEsperada: number;
  novo: FluxoProcesso;
  evento: EventoFluxo;
}

export interface GravacaoChecklist {
  versaoEsperada: number;
  novo: FluxoProcesso;
  evento: EventoFluxo;
}

/** Estado da Central e trilha de auditoria. No Postgres tudo passa pelo RLS do escritório. */
export interface FluxoRepository {
  listar(usuarioId: string): Promise<FluxoProcesso[]>;
  obter(usuarioId: string, processoId: string): Promise<FluxoProcesso | null>;
  /** Do mais novo para o mais antigo. */
  eventos(usuarioId: string, processoId: string, limite: number): Promise<EventoFluxo[]>;
  /**
   * Muda a fase do processo, o estado e acrescenta o evento numa só operação. Lança
   * `conflitoDeFluxo()` se a fase ou a versão mudaram desde que a tela leu.
   */
  transicionar(usuarioId: string, g: GravacaoTransicao): Promise<Processo>;
  salvarChecklist(usuarioId: string, g: GravacaoChecklist): Promise<void>;
  excluirDoProcesso(usuarioId: string, processoId: string): Promise<void>;
  excluirDoUsuario(usuarioId: string): Promise<void>;
}

export function conflitoDeFluxo(): AppError {
  return new AppError("conflito", "Outra pessoa mexeu neste caso enquanto você olhava. A ficha foi atualizada; confira e tente de novo.");
}

const idValido = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id);
const naoEncontrado = () => new AppError("nao_encontrado", "Processo não encontrado.");

function chave(prefixo: string, usuarioId: string) {
  if (!idValido(usuarioId)) throw new Error("Identificador de usuário inválido.");
  return `${prefixo}/${usuarioId}`;
}

function semMeta(p: Processo): DadosProcesso {
  const { id: _i, criadoEm: _c, atualizadoEm: _a, ...dados } = p;
  return dados;
}

/** Versão em documento (sem DATABASE_URL): estado e eventos numa lista por conta. */
export class FluxoRepositoryDocumentos implements FluxoRepository {
  private readonly db: ArmazenamentoDocumentos;
  private readonly processos: ProcessoRepository;
  constructor(db: ArmazenamentoDocumentos, processos: ProcessoRepository) {
    this.db = db;
    this.processos = processos;
  }

  listar(usuarioId: string) {
    return this.db.ler<FluxoProcesso[]>(chave("fluxo", usuarioId), []);
  }

  async obter(usuarioId: string, processoId: string) {
    return (await this.listar(usuarioId)).find((f) => f.processoId === processoId) ?? null;
  }

  async eventos(usuarioId: string, processoId: string, limite: number) {
    const todos = await this.db.ler<EventoFluxo[]>(chave("fluxo-eventos", usuarioId), []);
    return todos
      .filter((e) => e.processoId === processoId)
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
      .slice(0, limite);
  }

  private gravarEstado(usuarioId: string, versaoEsperada: number, novo: FluxoProcesso, conferir?: () => Promise<void>) {
    return this.db.alterar<FluxoProcesso[]>(chave("fluxo", usuarioId), [], async (lista) => {
      const atual = lista.find((f) => f.processoId === novo.processoId);
      if ((atual?.versao ?? 0) !== versaoEsperada) throw conflitoDeFluxo();
      await conferir?.();
      return { valor: [...lista.filter((f) => f.processoId !== novo.processoId), novo], resultado: undefined };
    });
  }

  private acrescentar(usuarioId: string, e: EventoFluxo) {
    return this.db.alterar<EventoFluxo[]>(chave("fluxo-eventos", usuarioId), [], (lista) => ({ valor: [...lista, e], resultado: undefined }));
  }

  async transicionar(usuarioId: string, g: GravacaoTransicao) {
    let atualizado: Processo | null = null;
    await this.gravarEstado(usuarioId, g.versaoEsperada, g.novo, async () => {
      const agora = await this.processos.porId(usuarioId, g.processo.id);
      if (!agora) throw naoEncontrado();
      if (agora.fase !== g.de) throw conflitoDeFluxo();
      atualizado = await this.processos.atualizar(usuarioId, g.processo.id, { ...semMeta(agora), fase: g.para }, g.novo.atualizadoEm);
      if (!atualizado) throw naoEncontrado();
    });
    await this.acrescentar(usuarioId, g.evento);
    return atualizado!;
  }

  async salvarChecklist(usuarioId: string, g: GravacaoChecklist) {
    await this.gravarEstado(usuarioId, g.versaoEsperada, g.novo);
    await this.acrescentar(usuarioId, g.evento);
  }

  async excluirDoProcesso(usuarioId: string, processoId: string) {
    await this.db.alterar<FluxoProcesso[]>(chave("fluxo", usuarioId), [], (l) => ({ valor: l.filter((f) => f.processoId !== processoId), resultado: undefined }));
    await this.db.alterar<EventoFluxo[]>(chave("fluxo-eventos", usuarioId), [], (l) => ({ valor: l.filter((e) => e.processoId !== processoId), resultado: undefined }));
  }

  async excluirDoUsuario(usuarioId: string) {
    await this.db.remover(chave("fluxo", usuarioId));
    await this.db.remover(chave("fluxo-eventos", usuarioId));
  }
}

export interface Autor {
  id: string;
  nome: string;
}

export interface ResultadoLote {
  id: string;
  ok: boolean;
  referencia?: string;
  mensagem?: string;
  bloqueios?: string[];
}

/** "Hoje" no fuso do escritório (Brasília), para prescrição e prazos. */
function hojeEmBrasilia(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Regras da Central de casos. Quem decide se um caso muda de etapa é sempre este serviço (com o
 * motor); a tela só mostra a mesma avaliação antes, para não haver surpresa.
 */
export class FluxoService {
  private readonly repo: FluxoRepository;
  private readonly processos: ProcessoRepository;
  private readonly motor: MotorDeFluxo;
  private readonly clock: Clock;

  constructor(d: { repo: FluxoRepository; processos: ProcessoRepository; motor: MotorDeFluxo; clock: Clock }) {
    this.repo = d.repo;
    this.processos = d.processos;
    this.motor = d.motor;
    this.clock = d.clock;
  }

  async painel(usuarioId: string) {
    const [processos, fluxos] = await Promise.all([this.processos.listar(usuarioId), this.repo.listar(usuarioId)]);
    return { processos, fluxos: Object.fromEntries(fluxos.map((f) => [f.processoId, f])) as Record<string, FluxoProcesso> };
  }

  private async carregar(usuarioId: string, id: string) {
    const processo = idValido(id) ? await this.processos.porId(usuarioId, id) : null;
    if (!processo) throw naoEncontrado();
    return { processo, fluxo: fluxoEfetivo(processo, (await this.repo.obter(usuarioId, id)) ?? undefined) };
  }

  async ficha(usuarioId: string, id: string) {
    const { processo, fluxo } = await this.carregar(usuarioId, id);
    return { processo, fluxo, eventos: await this.repo.eventos(usuarioId, id, LIMITES_FLUXO.eventosNaFicha) };
  }

  async transicionar(autor: Autor, id: string, corpo: unknown) {
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as { para?: unknown; motivo?: unknown; versao?: unknown };
    if (!ehEtapa(c.para)) throw new AppError("dados_invalidos", "Etapa de destino inválida.", { campo: "para" });
    if (c.motivo !== undefined && typeof c.motivo !== "string") throw new AppError("dados_invalidos", "Motivo inválido.", { campo: "motivo" });
    if (typeof c.versao !== "number" || !Number.isInteger(c.versao) || c.versao < 0) throw new AppError("dados_invalidos", "Versão inválida.");
    return this.executarTransicao(autor, id, c.para, c.versao, c.motivo);
  }

  private async executarTransicao(autor: Autor, id: string, para: FaseProcesso, versao: number | "atual", motivo?: string) {
    const { processo, fluxo } = await this.carregar(autor.id, id);
    if (versao !== "atual" && versao !== fluxo.versao) throw conflitoDeFluxo();
    const agora = this.clock.agora();
    const avaliacao = this.motor.avaliar({ processo, fluxo, para, motivo, hoje: hojeEmBrasilia(agora) });
    if (!avaliacao.permitido) {
      throw new AppError("transicao_bloqueada", avaliacao.bloqueios[0].mensagem, { bloqueios: avaliacao.bloqueios });
    }
    const quando = agora.toISOString();
    const novo: FluxoProcesso = { ...fluxo, etapa: para, etapaDesde: quando, versao: fluxo.versao + 1, atualizadoEm: quando };
    const avancou = indiceEtapa(para) > indiceEtapa(processo.fase);
    const evento: EventoFluxo = {
      id: novoId(),
      processoId: id,
      tipo: avancou ? "avanco" : "retorno",
      de: processo.fase,
      para,
      ...(!avancou && motivo ? { motivo: motivo.trim() } : {}),
      autorId: autor.id,
      autorNome: nomeDoAutor(autor),
      criadoEm: quando,
    };
    const atualizado = await this.repo.transicionar(autor.id, { processo, de: processo.fase, para, versaoEsperada: fluxo.versao, novo, evento });
    return { processo: atualizado, fluxo: novo, evento, avisos: avaliacao.avisos };
  }

  async marcarItem(autor: Autor, id: string, corpo: unknown) {
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as { item?: unknown; feito?: unknown; versao?: unknown };
    const modelo = typeof c.item === "string" ? modeloDoItem(c.item) : undefined;
    if (!modelo) throw new AppError("dados_invalidos", "Item do checklist desconhecido.", { campo: "item" });
    if (modelo.item.automatico) throw new AppError("dados_invalidos", "Este item é conferido pelos dados do cadastro.", { campo: "item" });
    if (typeof c.feito !== "boolean") throw new AppError("dados_invalidos", "Informe se o item está feito.");
    if (typeof c.versao !== "number" || !Number.isInteger(c.versao) || c.versao < 0) throw new AppError("dados_invalidos", "Versão inválida.");

    const { processo, fluxo } = await this.carregar(autor.id, id);
    if (c.versao !== fluxo.versao) throw conflitoDeFluxo();
    if (modelo.etapa !== processo.fase) throw new AppError("dados_invalidos", "Este item é de outra etapa.", { campo: "item" });
    if (Boolean(fluxo.checklist[modelo.item.id]) === c.feito) return { fluxo };

    const quando = this.clock.agora().toISOString();
    const checklist = { ...fluxo.checklist };
    if (c.feito) checklist[modelo.item.id] = { por: autor.id, porNome: nomeDoAutor(autor), em: quando };
    else delete checklist[modelo.item.id];
    const novo: FluxoProcesso = { ...fluxo, checklist, versao: fluxo.versao + 1, atualizadoEm: quando };
    const evento: EventoFluxo = {
      id: novoId(),
      processoId: id,
      tipo: c.feito ? "item_marcado" : "item_desmarcado",
      item: modelo.item.id,
      autorId: autor.id,
      autorNome: nomeDoAutor(autor),
      criadoEm: quando,
    };
    await this.repo.salvarChecklist(autor.id, { versaoEsperada: fluxo.versao, novo, evento });
    return { fluxo: novo, evento };
  }

  /** Ação em vários casos: cada um é conferido sozinho, e o resultado diz o que passou e o que não. */
  async lote(autor: Autor, corpo: unknown): Promise<{ resultados: ResultadoLote[] }> {
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as { acao?: unknown; ids?: unknown; responsavelId?: unknown };
    if (!Array.isArray(c.ids) || !c.ids.length || !c.ids.every(idValido)) throw new AppError("dados_invalidos", "Escolha os casos.");
    const ids = [...new Set(c.ids as string[])];
    if (ids.length > LIMITES_FLUXO.lote) throw new AppError("dados_invalidos", `No máximo ${LIMITES_FLUXO.lote} casos por vez.`);

    if (c.acao === "avancar") {
      const resultados: ResultadoLote[] = [];
      for (const id of ids) resultados.push(await this.avancarUm(autor, id));
      return { resultados };
    }
    if (c.acao === "atribuir") {
      const resp = c.responsavelId;
      if (resp !== null && !(typeof resp === "string" && resp.trim() && resp.length <= 200)) throw new AppError("dados_invalidos", "Responsável inválido.", { campo: "responsavelId" });
      const resultados: ResultadoLote[] = [];
      for (const id of ids) {
        const p = await this.processos.porId(autor.id, id);
        if (!p) {
          resultados.push({ id, ok: false, mensagem: "Processo não encontrado." });
          continue;
        }
        const dados = { ...semMeta(p), responsavelId: resp ?? undefined };
        if (!dados.responsavelId) delete dados.responsavelId;
        await this.processos.atualizar(autor.id, id, dados, this.clock.agora().toISOString());
        resultados.push({ id, ok: true });
      }
      return { resultados };
    }
    throw new AppError("dados_invalidos", "Ação desconhecida.");
  }

  private async avancarUm(autor: Autor, id: string): Promise<ResultadoLote> {
    try {
      const p = idValido(id) ? await this.processos.porId(autor.id, id) : null;
      if (!p) return { id, ok: false, mensagem: "Processo não encontrado." };
      const para = proximaEtapa(p.fase);
      if (!para) return { id, ok: false, mensagem: "Já está na última etapa." };
      await this.executarTransicao(autor, id, para, "atual");
      return { id, ok: true };
    } catch (e) {
      if (e instanceof AppError) {
        const bloqueios = (e.detalhes?.bloqueios as { mensagem: string }[] | undefined)?.map((b) => b.mensagem);
        return { id, ok: false, mensagem: e.message, ...(bloqueios ? { bloqueios } : {}) };
      }
      throw e;
    }
  }

  excluirDoProcesso(usuarioId: string, processoId: string) {
    return this.repo.excluirDoProcesso(usuarioId, processoId);
  }

  excluirDaConta(usuarioId: string) {
    return this.repo.excluirDoUsuario(usuarioId);
  }
}

const nomeDoAutor = (a: Autor) => a.nome.trim().slice(0, 120) || "Sem nome";
