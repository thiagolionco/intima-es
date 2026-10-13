import type { Movimentacao, MovimentacoesProcesso, Processo, UltimaMovimentacao } from "../../lib/processos.ts";
import { HORA, type Clock } from "../core/clock.ts";
import { AppError } from "../core/errors.ts";
import type { ArmazenamentoDocumentos } from "../infra/armazenamento.ts";
import { type ConsultarDataJud, indiceDataJud } from "./datajud.ts";
import type { ProcessoRepository } from "./processos.ts";

/** O que a lista de processos e a busca automática precisam saber de cada processo. */
export interface ResumoMovimentacoes {
  consultadoEm: string;
  ultima?: UltimaMovimentacao;
}

/** Última consulta ao DataJud de cada processo. O acesso passa sempre pelo escritório do usuário. */
export interface MovimentacaoRepository {
  obter(usuarioId: string, processoId: string): Promise<MovimentacoesProcesso | null>;
  /** Por id do processo. */
  resumos(usuarioId: string): Promise<Record<string, ResumoMovimentacoes>>;
  /** Grava por cima da consulta anterior do processo. */
  salvar(usuarioId: string, m: MovimentacoesProcesso): Promise<void>;
  /** Apaga a do processo (no Postgres, o ON DELETE CASCADE já faz isso). */
  excluirDoProcesso(usuarioId: string, processoId: string): Promise<void>;
  excluirDoUsuario(usuarioId: string): Promise<void>;
}

export const resumoDe = (m: MovimentacoesProcesso): ResumoMovimentacoes => {
  const [u] = m.movimentos;
  return { consultadoEm: m.consultadoEm, ...(u ? { ultima: { dataHora: u.dataHora, nome: u.nome } } : {}) };
};

function chave(usuarioId: string) {
  if (!/^[0-9a-f-]{36}$/.test(usuarioId)) throw new Error("Identificador de usuário inválido.");
  return `movimentacoes-processo/${usuarioId}`;
}

/** Versão em documento (sem DATABASE_URL): um mapa por conta. */
export class MovimentacaoRepositoryDocumentos implements MovimentacaoRepository {
  private readonly db: ArmazenamentoDocumentos;
  constructor(db: ArmazenamentoDocumentos) {
    this.db = db;
  }

  async obter(usuarioId: string, processoId: string) {
    return (await this.db.ler<Record<string, MovimentacoesProcesso>>(chave(usuarioId), {}))[processoId] ?? null;
  }

  async resumos(usuarioId: string) {
    const tudo = await this.db.ler<Record<string, MovimentacoesProcesso>>(chave(usuarioId), {});
    return Object.fromEntries(Object.entries(tudo).map(([id, m]) => [id, resumoDe(m)]));
  }

  salvar(usuarioId: string, m: MovimentacoesProcesso) {
    return this.db.alterar<Record<string, MovimentacoesProcesso>>(chave(usuarioId), {}, (tudo) => ({ valor: { ...tudo, [m.processoId]: m }, resultado: undefined }));
  }

  excluirDoProcesso(usuarioId: string, processoId: string) {
    return this.db.alterar<Record<string, MovimentacoesProcesso>>(chave(usuarioId), {}, (tudo) => {
      const { [processoId]: _, ...resto } = tudo;
      return { valor: resto, resultado: undefined };
    });
  }

  excluirDoUsuario(usuarioId: string) {
    return this.db.remover(chave(usuarioId));
  }
}

/** A busca automática não consulta de novo um processo visto há menos que isto. */
export const INTERVALO_CONSULTA = 20 * HORA;

const idValido = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id);
const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DepsMovimentacoes {
  repo: MovimentacaoRepository;
  processos: ProcessoRepository;
  /** Sem consulta configurada, a busca no DataJud fica desligada. */
  consultar?: ConsultarDataJud;
  clock: Clock;
  limitar?: (usuarioId: string) => void;
  listarUsuarios: () => Promise<string[]>;
  /** Pausa entre consultas da busca automática, para não sobrecarregar o DataJud. */
  pausaMs?: number;
}

const chaveMovimento = (x: Movimentacao) => `${x.dataHora}|${x.codigo}|${x.nome}|${x.grau}`;

/**
 * Andamentos dos processos pela API pública do DataJud (CNJ). Cada consulta guarda a lista
 * completa que o DataJud devolve; se falhar, os andamentos da consulta anterior continuam.
 */
export class MovimentacoesService {
  private readonly d: DepsMovimentacoes;
  private readonly emAndamento = new Set<string>();

  constructor(deps: DepsMovimentacoes) {
    this.d = deps;
  }

  get disponivel(): boolean {
    return !!this.d.consultar;
  }

  private async exigirProcesso(usuarioId: string, processoId: string): Promise<Processo> {
    const p = idValido(processoId) ? await this.d.processos.porId(usuarioId, processoId) : null;
    if (!p) throw new AppError("nao_encontrado", "Processo não encontrado.");
    return p;
  }

  async obter(usuarioId: string, processoId: string) {
    await this.exigirProcesso(usuarioId, processoId);
    return this.d.repo.obter(usuarioId, processoId);
  }

  /** Último andamento de cada processo, para a lista. */
  async ultimas(usuarioId: string): Promise<Record<string, UltimaMovimentacao>> {
    const resumos = await this.d.repo.resumos(usuarioId);
    return Object.fromEntries(Object.entries(resumos).flatMap(([id, r]) => (r.ultima ? [[id, r.ultima]] : [])));
  }

  /** Consulta agora, a pedido do usuário. `novos` conta os andamentos que não estavam na consulta anterior. */
  async atualizar(usuarioId: string, processoId: string): Promise<{ movimentacoes: MovimentacoesProcesso; novos: number }> {
    if (!this.d.consultar) throw new AppError("indisponivel", "A consulta ao DataJud está desligada neste servidor.");
    const p = await this.exigirProcesso(usuarioId, processoId);
    if (!indiceDataJud(p.numero)) throw new AppError("dados_invalidos", "O DataJud não tem processos deste tribunal (STF e CNJ ficam de fora).");
    if (this.emAndamento.has(processoId)) throw new AppError("conflito", "Já há uma consulta deste processo em andamento.");
    this.d.limitar?.(usuarioId);
    return this.consultar(usuarioId, p);
  }

  private async consultar(usuarioId: string, p: Processo) {
    this.emAndamento.add(p.id);
    try {
      const anterior = await this.d.repo.obter(usuarioId, p.id);
      const consultadoEm = this.d.clock.agora().toISOString();
      let m: MovimentacoesProcesso;
      try {
        const r = await this.d.consultar!(p.numero);
        m = { processoId: p.id, consultadoEm, encontrado: r.encontrado, movimentos: r.movimentos, ...(r.atualizadoNoTribunal ? { atualizadoNoTribunal: r.atualizadoNoTribunal } : {}) };
      } catch (e) {
        console.error(`[datajud] processo ${p.id}:`, mensagem(e));
        m = { ...(anterior ?? { processoId: p.id, encontrado: false, movimentos: [] }), consultadoEm, erro: mensagem(e) };
      }
      await this.d.repo.salvar(usuarioId, m);
      const ja = new Set((anterior?.movimentos ?? []).map(chaveMovimento));
      const novos = anterior && !m.erro ? m.movimentos.filter((x) => !ja.has(chaveMovimento(x))).length : 0;
      return { movimentacoes: m, novos };
    } finally {
      this.emAndamento.delete(p.id);
    }
  }

  /**
   * Busca automática: consulta, uma de cada vez, os processos de todas as contas que não foram
   * vistos nas últimas INTERVALO_CONSULTA horas. Membros do mesmo escritório veem os mesmos
   * processos, então cada processo entra uma vez só.
   */
  async rodarTodos(): Promise<{ consultados: number; novos: number; erros: number }> {
    const r = { consultados: 0, novos: 0, erros: 0 };
    if (!this.d.consultar) return r;
    const feitos = new Set<string>();
    const limite = this.d.clock.agora().getTime() - INTERVALO_CONSULTA;
    for (const usuarioId of await this.d.listarUsuarios()) {
      try {
        const [processos, resumos] = await Promise.all([this.d.processos.listar(usuarioId), this.d.repo.resumos(usuarioId)]);
        for (const p of processos) {
          if (feitos.has(p.id) || this.emAndamento.has(p.id) || !indiceDataJud(p.numero)) continue;
          feitos.add(p.id);
          const visto = resumos[p.id]?.consultadoEm;
          if (visto && Date.parse(visto) > limite) continue;
          const { movimentacoes, novos } = await this.consultar(usuarioId, p);
          r.consultados++;
          r.novos += novos;
          if (movimentacoes.erro) r.erros++;
          if (this.d.pausaMs) await esperar(this.d.pausaMs);
        }
      } catch (e) {
        r.erros++;
        console.error(`[datajud] conta ${usuarioId}:`, mensagem(e));
      }
    }
    return r;
  }

  excluirDoProcesso(usuarioId: string, processoId: string) {
    return this.d.repo.excluirDoProcesso(usuarioId, processoId);
  }

  excluirDaConta(usuarioId: string) {
    return this.d.repo.excluirDoUsuario(usuarioId);
  }
}
