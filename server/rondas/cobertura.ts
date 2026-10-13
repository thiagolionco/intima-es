import { type DiaCoberto, DIAS_DE_VIGILIA, diaEmBrasilia, mesclarDia, type ResumoCobertura, resumirCobertura } from "../../lib/cobertura.ts";
import { somarDias } from "../../lib/prazos/datas.ts";
import type { Clock } from "../core/clock.ts";
import type { ArmazenamentoDocumentos } from "../infra/armazenamento.ts";
import type { EspacoTrabalhoRepository } from "../workspace/espaco-trabalho.ts";

/** Livro de cobertura. O acesso passa sempre pelo escritório do usuário (RLS no Postgres). */
export interface CoberturaRepository {
  /** Grava os dias, mesclando com o que já havia (ver `mesclarDia`). */
  registrar(usuarioId: string, dias: DiaCoberto[]): Promise<void>;
  /** Registros a partir do dia `desde` (AAAA-MM-DD), de todos os termos. */
  listar(usuarioId: string, desde: string): Promise<DiaCoberto[]>;
  excluirDoUsuario(usuarioId: string): Promise<void>;
}

/** Quanto tempo o livro guarda cada dia. Mais que a janela de vigília, para consulta. */
export const DIAS_GUARDADOS = 90;

const chaveDia = (d: Pick<DiaCoberto, "termoId" | "dia">) => `${d.termoId}|${d.dia}`;

function chave(usuarioId: string) {
  if (!/^[0-9a-f-]{36}$/.test(usuarioId)) throw new Error("Identificador de usuário inválido.");
  return `cobertura/${usuarioId}`;
}

/** Versão em documento (sem DATABASE_URL): um mapa por conta, podado a DIAS_GUARDADOS. */
export class CoberturaRepositoryDocumentos implements CoberturaRepository {
  private readonly db: ArmazenamentoDocumentos;
  private readonly clock: Clock;
  constructor(db: ArmazenamentoDocumentos, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  registrar(usuarioId: string, dias: DiaCoberto[]) {
    const limite = somarDias(diaEmBrasilia(this.clock.agora()), -DIAS_GUARDADOS);
    return this.db.alterar<Record<string, DiaCoberto>>(chave(usuarioId), {}, (tudo) => {
      const valor: Record<string, DiaCoberto> = {};
      for (const [k, d] of Object.entries(tudo)) if (d.dia >= limite) valor[k] = d;
      for (const d of dias) valor[chaveDia(d)] = mesclarDia(valor[chaveDia(d)], d);
      return { valor, resultado: undefined };
    });
  }

  async listar(usuarioId: string, desde: string) {
    return Object.values(await this.db.ler<Record<string, DiaCoberto>>(chave(usuarioId), {})).filter((d) => d.dia >= desde);
  }

  excluirDoUsuario(usuarioId: string) {
    return this.db.remover(chave(usuarioId));
  }
}

export interface DepsCobertura {
  repo: CoberturaRepository;
  espacos: EspacoTrabalhoRepository;
  clock: Clock;
  rondaLigada: boolean;
  intervaloHoras: number;
}

/** O que o Selo de Vigília e as faixas de aviso mostram. */
export class CoberturaService {
  private readonly d: DepsCobertura;
  constructor(deps: DepsCobertura) {
    this.d = deps;
  }

  async resumo(usuarioId: string): Promise<ResumoCobertura> {
    const agora = this.d.clock.agora();
    const [espaco, dias] = await Promise.all([this.d.espacos.ler(usuarioId), this.d.repo.listar(usuarioId, somarDias(diaEmBrasilia(agora), -DIAS_DE_VIGILIA))]);
    return resumirCobertura(espaco.termos, dias, { agora, rondaLigada: this.d.rondaLigada, intervaloHoras: this.d.intervaloHoras });
  }
}
