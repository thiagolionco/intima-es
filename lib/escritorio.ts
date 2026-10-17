/**
 * Papéis de quem trabalha num escritório e o que cada um pode fazer. Usado pelo servidor (que
 * decide) e pela interface (que só esconde o que não vai funcionar).
 */
export const PAPEIS = ["dono", "advogado", "estagiario"] as const;
export type PapelNoEscritorio = (typeof PAPEIS)[number];

export const ROTULO_PAPEL: Record<PapelNoEscritorio, string> = {
  dono: "Dono",
  advogado: "Advogado",
  estagiario: "Estagiário",
};

export const DESCRICAO_PAPEL: Record<PapelNoEscritorio, string> = {
  dono: "Faz tudo, inclusive convidar pessoas, mudar papéis e tirar alguém do escritório.",
  advogado: "Trabalha em tudo (intimações, processos, prazos), mas não mexe na equipe.",
  estagiario: "Trabalha nas intimações e processos, mas não exclui nada e não mexe na equipe.",
};

export type Acao =
  /** Convidar, mudar papel, tirar do escritório, editar a lista da equipe. */
  | "gerenciar_equipe"
  /** Excluir intimações, processos e PDFs. */
  | "excluir"
  /** Transformar um processo do escritório em particular. */
  | "tornar_particular";

const PERMISSOES: Record<PapelNoEscritorio, ReadonlySet<Acao>> = {
  dono: new Set<Acao>(["gerenciar_equipe", "excluir", "tornar_particular"]),
  advogado: new Set<Acao>(["excluir"]),
  estagiario: new Set<Acao>(),
};

export function pode(papel: PapelNoEscritorio | null | undefined, acao: Acao): boolean {
  return !!papel && PERMISSOES[papel].has(acao);
}

export function ehPapel(v: unknown): v is PapelNoEscritorio {
  return typeof v === "string" && (PAPEIS as readonly string[]).includes(v);
}

/** Uma conta com acesso ao escritório. */
export interface MembroEscritorio {
  usuarioId: string;
  nome: string;
  email: string;
  papel: PapelNoEscritorio;
  desde: string;
}

/** Convite enviado e ainda não aceito. */
export interface ConvitePendente {
  id: string;
  email: string;
  papel: PapelNoEscritorio;
  pessoaId?: string;
  convidadoPor?: string;
  criadoEm: string;
  expiraEm: string;
}

/** O que a tela Equipe recebe: o escritório, o papel de quem está vendo, quem tem acesso e os convites. */
export interface ResumoEscritorio {
  nome: string;
  papel: PapelNoEscritorio;
  eu: string;
  membros: MembroEscritorio[];
  /** Só para quem gerencia a equipe. */
  convites: ConvitePendente[];
  /** Convites precisam do banco de dados; sem ele a conta é um escritório de uma pessoa só. */
  convitesDisponiveis: boolean;
}
