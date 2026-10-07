/**
 * Portas (interfaces) do módulo de autenticação.
 *
 * Os serviços dependem só destas abstrações (Inversão de Dependência). Trocar o banco
 * em arquivo por Postgres, ou o e-mail de desenvolvimento por SMTP, é escrever uma nova
 * implementação e registrá-la em server/container.ts, sem tocar nos serviços.
 */
import type { DesafioDoisFatores, EventoAuditoria, FinalidadeToken, Sessao, TokenVerificacao, Usuario } from "./model.ts";

export interface UsuarioRepository {
  porId(id: string): Promise<Usuario | null>;
  porEmail(email: string): Promise<Usuario | null>;
  criar(usuario: Usuario): Promise<void>;
  atualizar(id: string, alteracoes: Partial<Usuario>): Promise<Usuario>;
  excluir(id: string): Promise<void>;
}

export interface SessaoRepository {
  porId(id: string): Promise<Sessao | null>;
  doUsuario(usuarioId: string): Promise<Sessao[]>;
  salvar(sessao: Sessao): Promise<void>;
  excluir(id: string): Promise<void>;
  excluirDoUsuario(usuarioId: string, exceto?: string): Promise<number>;
}

export interface TokenRepository {
  salvar(token: TokenVerificacao): Promise<void>;
  /** Consulta sem consumir (só tokens vigentes). */
  porId(id: string, finalidade: FinalidadeToken): Promise<TokenVerificacao | null>;
  /** Busca e remove (uso único). */
  consumir(id: string, finalidade: FinalidadeToken): Promise<TokenVerificacao | null>;
  excluirDoUsuario(usuarioId: string, finalidade?: FinalidadeToken): Promise<void>;
}

export interface DesafioRepository {
  salvar(desafio: DesafioDoisFatores): Promise<void>;
  porId(id: string): Promise<DesafioDoisFatores | null>;
  excluir(id: string): Promise<void>;
}

export interface Auditoria {
  registrar(evento: Omit<EventoAuditoria, "id" | "em">): Promise<void>;
  doUsuario(usuarioId: string, limite?: number): Promise<EventoAuditoria[]>;
  excluirDoUsuario(usuarioId: string): Promise<void>;
}

export interface HashDeSenha {
  gerar(senha: string): Promise<string>;
  verificar(senha: string, hash: string): Promise<boolean>;
}

export interface LimitadorDeTaxa {
  /** Consome uma tentativa; lança AppError("muitas_tentativas") ao estourar o limite. */
  consumir(chave: string, limite: number, janelaMs: number): void;
  zerar(chave: string): void;
}

export interface SegundoFator {
  gerarSegredo(): string;
  uriDeConfiguracao(segredo: string, conta: string, emissor: string): string;
  /** Passo de tempo do código aceito, ou null se inválido. */
  verificar(segredo: string, codigo: string): number | null;
}

/** Avisos enviados ao titular da conta. O serviço não sabe se viram e-mail, SMS ou push. */
export interface NotificacoesDeConta {
  confirmarEmail(usuario: Usuario, link: string): Promise<void>;
  redefinirSenha(usuario: Usuario, link: string): Promise<void>;
  /** Alguém tentou criar conta com um e-mail já cadastrado (evita revelar a existência da conta). */
  contaJaExiste(usuario: Usuario, linkEntrar: string, linkRedefinir: string): Promise<void>;
  senhaAlterada(usuario: Usuario, contexto: { ip: string; userAgent: string }): Promise<void>;
  novoAcesso(usuario: Usuario, contexto: { ip: string; userAgent: string }): Promise<void>;
  doisFatoresAlterado(usuario: Usuario, ativo: boolean): Promise<void>;
  contaBloqueada(usuario: Usuario, ate: Date, linkRedefinir: string): Promise<void>;
}
