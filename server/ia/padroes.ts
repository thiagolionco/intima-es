import { type DadosPadrao, instrucoesDosPadroes, LIMITES_PADRAO, normalizarPadrao, type PadraoIa, type UsoPadrao, validarPadrao } from "../../lib/padroes.ts";
import type { Clock } from "../core/clock.ts";
import { novoId } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import { idValido, nomeDoAutor, type Registro, type RegistrosRepository } from "../registros/registros.ts";

type ValorPadrao = Omit<PadraoIa, "id" | "criadoEm" | "atualizadoEm">;

const paraPadrao = (r: Registro<ValorPadrao>): PadraoIa => ({ ...r.valor, id: r.id, criadoEm: r.criadoEm, atualizadoEm: r.atualizadoEm });

const naoEncontrado = () => new AppError("nao_encontrado", "Padrão não encontrado.");

function exigirValido(corpo: unknown): DadosPadrao {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Partial<Record<keyof DadosPadrao, unknown>>;
  const erros = validarPadrao(c);
  const [campo, mensagem] = Object.entries(erros).find(([, m]) => m) ?? [];
  if (campo && mensagem) throw new AppError("dados_invalidos", mensagem, { campo, erros });
  return normalizarPadrao(c);
}

/**
 * Padrões do escritório para a IA. Os do escritório valem para todos; os pessoais só para quem os
 * criou (no Postgres, o RLS esconde dos outros).
 */
export class PadroesService {
  private readonly repo: RegistrosRepository;
  private readonly clock: Clock;

  constructor(d: { repo: RegistrosRepository; clock: Clock }) {
    this.repo = d.repo;
    this.clock = d.clock;
  }

  /** Os do escritório primeiro, depois os pessoais; dentro de cada grupo, por nome. */
  async listar(usuarioId: string): Promise<PadraoIa[]> {
    const todos = (await this.repo.listar<ValorPadrao>(usuarioId, "padrao")).filter((r) => !r.donoId || r.donoId === usuarioId).map(paraPadrao);
    return todos.sort((a, b) => (a.escopo === b.escopo ? a.nome.localeCompare(b.nome, "pt-BR") : a.escopo === "escritorio" ? -1 : 1));
  }

  async criar(autor: { id: string; nome: string }, corpo: unknown): Promise<PadraoIa> {
    const dados = exigirValido(corpo);
    if ((await this.repo.listar(autor.id, "padrao")).length >= LIMITES_PADRAO.porEscritorio) {
      throw new AppError("dados_invalidos", `Limite de ${LIMITES_PADRAO.porEscritorio} padrões.`);
    }
    const agora = this.clock.agora().toISOString();
    const r: Registro<ValorPadrao> = {
      id: novoId(),
      tipo: "padrao",
      ...(dados.escopo === "pessoal" ? { donoId: autor.id } : {}),
      valor: { ...dados, autorId: autor.id, autorNome: nomeDoAutor(autor.nome) },
      criadoEm: agora,
      atualizadoEm: agora,
    };
    await this.repo.gravar(autor.id, r);
    return paraPadrao(r);
  }

  /** O escopo não muda depois de criado: para tornar pessoal ou do escritório, crie outro. */
  async atualizar(usuarioId: string, id: string, corpo: unknown): Promise<PadraoIa> {
    const atual = idValido(id) ? await this.repo.obter<ValorPadrao>(usuarioId, "padrao", id) : null;
    if (!atual || (atual.donoId && atual.donoId !== usuarioId)) throw naoEncontrado();
    const dados = exigirValido({ ...(corpo as object), escopo: atual.valor.escopo });
    const salvo = await this.repo.alterar<ValorPadrao>(usuarioId, "padrao", id, (r) => ({ ...r.valor, ...dados }), this.clock.agora().toISOString());
    if (!salvo) throw naoEncontrado();
    return paraPadrao(salvo);
  }

  async excluir(usuarioId: string, id: string) {
    const atual = idValido(id) ? await this.repo.obter<ValorPadrao>(usuarioId, "padrao", id) : null;
    if (!atual || (atual.donoId && atual.donoId !== usuarioId)) throw naoEncontrado();
    await this.repo.excluir(usuarioId, "padrao", id);
  }

  /** Instruções que a IA segue nesta tarefa, para este usuário. Vazio quando não há padrão. */
  async instrucoes(usuarioId: string, uso: UsoPadrao): Promise<string> {
    try {
      return instrucoesDosPadroes(await this.listar(usuarioId), uso);
    } catch (e) {
      // Sem os padrões a IA ainda funciona: não derruba a tarefa por isso.
      console.error("[padroes] não foi possível ler:", e instanceof Error ? e.message : e);
      return "";
    }
  }
}
