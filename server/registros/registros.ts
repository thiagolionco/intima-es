import type { ArmazenamentoDocumentos } from "../infra/armazenamento.ts";

/**
 * Tipos de registro do escritório. Cada ferramenta guarda o seu conteúdo em `valor`; o tipo diz
 * qual é a forma. Ficam todos na mesma tabela (escritorio_registros) com o mesmo isolamento.
 */
export type TipoRegistro =
  | "padrao"
  | "verificacao"
  | "fatos"
  | "nota"
  | "providencias"
  | "revisao"
  | "modelo_revisao"
  | "execucao_agente"
  | "portal"
  | "formulario_pedidos"
  | "pedido"
  | "monitor"
  | "alerta"
  | "fluxo_ia"
  | "execucao_fluxo";

export interface Registro<T = unknown> {
  id: string;
  tipo: TipoRegistro;
  /** Ligado a um processo: some com ele e só aparece para quem vê o processo. */
  processoId?: string;
  /** Pessoal: só esta conta vê, mesmo dentro do escritório. */
  donoId?: string;
  valor: T;
  criadoEm: string;
  atualizadoEm: string;
}

/** Registros do escritório do usuário. No Postgres, isolados por RLS (migração 0014). */
export interface RegistrosRepository {
  listar<T>(usuarioId: string, tipo: TipoRegistro, filtro?: { processoId?: string }): Promise<Registro<T>[]>;
  obter<T>(usuarioId: string, tipo: TipoRegistro, id: string): Promise<Registro<T> | null>;
  /** Cria ou substitui pelo id. */
  gravar<T>(usuarioId: string, r: Registro<T>): Promise<void>;
  /**
   * Lê, altera e grava na mesma transação (ou na mesma fila, sem banco). `fn` devolve o valor novo,
   * ou null para não mexer. Devolve o registro gravado, ou null se não existia ou nada mudou.
   */
  alterar<T>(usuarioId: string, tipo: TipoRegistro, id: string, fn: (atual: Registro<T>) => T | null, atualizadoEm: string): Promise<Registro<T> | null>;
  excluir(usuarioId: string, tipo: TipoRegistro, id: string): Promise<boolean>;
  /** No Postgres, o ON DELETE CASCADE já faz isso. */
  excluirDoProcesso(usuarioId: string, processoId: string): Promise<void>;
  excluirDoUsuario(usuarioId: string): Promise<void>;
}

function chave(usuarioId: string) {
  if (!/^[0-9a-f-]{36}$/.test(usuarioId)) throw new Error("Identificador de usuário inválido.");
  return `registros/${usuarioId}`;
}

/** Versão em documento (sem DATABASE_URL): uma lista por conta, com todos os tipos. */
export class RegistrosRepositoryDocumentos implements RegistrosRepository {
  private readonly db: ArmazenamentoDocumentos;
  constructor(db: ArmazenamentoDocumentos) {
    this.db = db;
  }

  async listar<T>(usuarioId: string, tipo: TipoRegistro, filtro: { processoId?: string } = {}) {
    const todos = await this.db.ler<Registro[]>(chave(usuarioId), []);
    return todos.filter((r) => r.tipo === tipo && (!filtro.processoId || r.processoId === filtro.processoId)) as Registro<T>[];
  }

  async obter<T>(usuarioId: string, tipo: TipoRegistro, id: string) {
    return ((await this.db.ler<Registro[]>(chave(usuarioId), [])).find((r) => r.tipo === tipo && r.id === id) as Registro<T>) ?? null;
  }

  gravar<T>(usuarioId: string, r: Registro<T>) {
    return this.db.alterar<Registro[]>(chave(usuarioId), [], (lista) => ({ valor: [...lista.filter((x) => x.id !== r.id), r as Registro], resultado: undefined }));
  }

  alterar<T>(usuarioId: string, tipo: TipoRegistro, id: string, fn: (atual: Registro<T>) => T | null, atualizadoEm: string) {
    return this.db.alterar<Registro[], Registro<T> | null>(chave(usuarioId), [], (lista) => {
      const atual = lista.find((r) => r.tipo === tipo && r.id === id) as Registro<T> | undefined;
      const valor = atual ? fn(atual) : null;
      if (!atual || valor === null) return { valor: lista, resultado: null };
      const novo: Registro<T> = { ...atual, valor, atualizadoEm };
      return { valor: lista.map((r) => (r === (atual as Registro) ? (novo as Registro) : r)), resultado: novo };
    });
  }

  excluir(usuarioId: string, tipo: TipoRegistro, id: string) {
    return this.db.alterar<Registro[], boolean>(chave(usuarioId), [], (lista) => {
      const resto = lista.filter((r) => !(r.tipo === tipo && r.id === id));
      return { valor: resto, resultado: resto.length !== lista.length };
    });
  }

  excluirDoProcesso(usuarioId: string, processoId: string) {
    return this.db.alterar<Registro[]>(chave(usuarioId), [], (lista) => ({ valor: lista.filter((r) => r.processoId !== processoId), resultado: undefined }));
  }

  excluirDoUsuario(usuarioId: string) {
    return this.db.remover(chave(usuarioId));
  }
}

export const idValido = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id);

/** Texto limpo e cortado; vazio vira undefined. */
export function textoLimpo(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export const nomeDoAutor = (nome: string) => nome.trim().slice(0, 120) || "Sem nome";
