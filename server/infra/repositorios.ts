import type { DesafioDoisFatores, EventoAuditoria, FinalidadeToken, Sessao, TokenVerificacao, Usuario } from "../auth/model.ts";
import type { Auditoria, DesafioRepository, SessaoRepository, TokenRepository, UsuarioRepository } from "../auth/ports.ts";
import type { Clock } from "../core/clock.ts";
import { novoId } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import type { ArmazenamentoDocumentos } from "./armazenamento.ts";

/** Implementações dos repositórios sobre qualquer ArmazenamentoDocumentos. */

export class UsuarioRepositoryDocumentos implements UsuarioRepository {
  private readonly db: ArmazenamentoDocumentos;
  constructor(db: ArmazenamentoDocumentos) {
    this.db = db;
  }

  async porId(id: string) {
    return (await this.db.ler<Usuario[]>("usuarios", [])).find((u) => u.id === id) ?? null;
  }

  async porEmail(email: string) {
    return (await this.db.ler<Usuario[]>("usuarios", [])).find((u) => u.email === email) ?? null;
  }

  criar(usuario: Usuario) {
    return this.db.alterar<Usuario[]>("usuarios", [], (lista) => {
      if (lista.some((u) => u.email === usuario.email)) throw new AppError("conflito", "Já existe uma conta com este e-mail.");
      return { valor: [...lista, usuario], resultado: undefined };
    });
  }

  atualizar(id: string, alteracoes: Partial<Usuario>) {
    return this.db.alterar<Usuario[], Usuario>("usuarios", [], (lista) => {
      const i = lista.findIndex((u) => u.id === id);
      if (i < 0) throw new AppError("nao_encontrado", "Usuário não encontrado.");
      const atualizado = { ...lista[i], ...alteracoes, id };
      const copia = [...lista];
      copia[i] = atualizado;
      return { valor: copia, resultado: atualizado };
    });
  }

  excluir(id: string) {
    return this.db.alterar<Usuario[]>("usuarios", [], (lista) => ({ valor: lista.filter((u) => u.id !== id), resultado: undefined }));
  }
}

export class SessaoRepositoryDocumentos implements SessaoRepository {
  private readonly db: ArmazenamentoDocumentos;
  private readonly clock: Clock;
  constructor(db: ArmazenamentoDocumentos, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  private vigentes(lista: Sessao[]) {
    const agora = this.clock.agora().toISOString();
    return lista.filter((s) => s.expiraEm > agora);
  }

  async porId(id: string) {
    return (await this.db.ler<Sessao[]>("sessoes", [])).find((s) => s.id === id) ?? null;
  }

  async doUsuario(usuarioId: string) {
    return this.vigentes(await this.db.ler<Sessao[]>("sessoes", [])).filter((s) => s.usuarioId === usuarioId);
  }

  salvar(sessao: Sessao) {
    return this.db.alterar<Sessao[]>("sessoes", [], (lista) => ({
      valor: [...this.vigentes(lista).filter((s) => s.id !== sessao.id), sessao],
      resultado: undefined,
    }));
  }

  excluir(id: string) {
    return this.db.alterar<Sessao[]>("sessoes", [], (lista) => ({ valor: lista.filter((s) => s.id !== id), resultado: undefined }));
  }

  excluirDoUsuario(usuarioId: string, exceto?: string) {
    return this.db.alterar<Sessao[], number>("sessoes", [], (lista) => {
      const restantes = lista.filter((s) => s.usuarioId !== usuarioId || s.id === exceto);
      return { valor: restantes, resultado: lista.length - restantes.length };
    });
  }
}

export class TokenRepositoryDocumentos implements TokenRepository {
  private readonly db: ArmazenamentoDocumentos;
  private readonly clock: Clock;
  constructor(db: ArmazenamentoDocumentos, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  salvar(token: TokenVerificacao) {
    const agora = this.clock.agora().toISOString();
    return this.db.alterar<TokenVerificacao[]>("tokens", [], (lista) => ({
      valor: [...lista.filter((t) => t.expiraEm > agora), token],
      resultado: undefined,
    }));
  }

  async porId(id: string, finalidade: FinalidadeToken) {
    const agora = this.clock.agora().toISOString();
    return (await this.db.ler<TokenVerificacao[]>("tokens", [])).find((t) => t.id === id && t.finalidade === finalidade && t.expiraEm > agora) ?? null;
  }

  consumir(id: string, finalidade: FinalidadeToken) {
    const agora = this.clock.agora().toISOString();
    return this.db.alterar<TokenVerificacao[], TokenVerificacao | null>("tokens", [], (lista) => {
      const token = lista.find((t) => t.id === id && t.finalidade === finalidade && t.expiraEm > agora) ?? null;
      return { valor: lista.filter((t) => t.id !== id), resultado: token };
    });
  }

  excluirDoUsuario(usuarioId: string, finalidade?: FinalidadeToken) {
    return this.db.alterar<TokenVerificacao[]>("tokens", [], (lista) => ({
      valor: lista.filter((t) => t.usuarioId !== usuarioId || (finalidade !== undefined && t.finalidade !== finalidade)),
      resultado: undefined,
    }));
  }
}

export class DesafioRepositoryDocumentos implements DesafioRepository {
  private readonly db: ArmazenamentoDocumentos;
  private readonly clock: Clock;
  constructor(db: ArmazenamentoDocumentos, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  salvar(desafio: DesafioDoisFatores) {
    const agora = this.clock.agora().toISOString();
    return this.db.alterar<DesafioDoisFatores[]>("desafios", [], (lista) => ({
      valor: [...lista.filter((d) => d.expiraEm > agora && d.id !== desafio.id), desafio],
      resultado: undefined,
    }));
  }

  async porId(id: string) {
    const agora = this.clock.agora().toISOString();
    return (await this.db.ler<DesafioDoisFatores[]>("desafios", [])).find((d) => d.id === id && d.expiraEm > agora) ?? null;
  }

  excluir(id: string) {
    return this.db.alterar<DesafioDoisFatores[]>("desafios", [], (lista) => ({ valor: lista.filter((d) => d.id !== id), resultado: undefined }));
  }
}

const LIMITE_EVENTOS = 300;

export class AuditoriaDocumentos implements Auditoria {
  private readonly db: ArmazenamentoDocumentos;
  private readonly clock: Clock;
  constructor(db: ArmazenamentoDocumentos, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  registrar(evento: Omit<EventoAuditoria, "id" | "em">) {
    const completo: EventoAuditoria = { ...evento, id: novoId(), em: this.clock.agora().toISOString() };
    return this.db.alterar<EventoAuditoria[]>(`auditoria/${evento.usuarioId}`, [], (lista) => ({
      valor: [completo, ...lista].slice(0, LIMITE_EVENTOS),
      resultado: undefined,
    }));
  }

  async doUsuario(usuarioId: string, limite = 100) {
    return (await this.db.ler<EventoAuditoria[]>(`auditoria/${usuarioId}`, [])).slice(0, limite);
  }

  excluirDoUsuario(usuarioId: string) {
    return this.db.remover(`auditoria/${usuarioId}`);
  }
}
