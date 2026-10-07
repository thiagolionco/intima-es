import type { Clock } from "../../core/clock.ts";
import type {
  Auditoria,
  DesafioRepository,
  HashDeSenha,
  LimitadorDeTaxa,
  NotificacoesDeConta,
  SegundoFator,
  SessaoRepository,
  TokenRepository,
  UsuarioRepository,
} from "../ports.ts";

/** Gera os links absolutos que vão nos e-mails. */
export interface Links {
  entrar(email?: string): string;
  confirmarEmail(token: string): string;
  redefinirSenha(token: string): string;
  esqueciSenha(email?: string): string;
}

export interface PoliticaSessao {
  /** Inatividade máxima e duração absoluta, em ms, para sessões sem "manter conectado". */
  curtaInatividade: number;
  curtaAbsoluta: number;
  /** Idem para sessões com "manter conectado". */
  longaInatividade: number;
  longaAbsoluta: number;
}

/**
 * Todas as dependências possíveis. Cada serviço declara com Pick<> apenas as que usa
 * (Segregação de Interfaces), o que também deixa os testes enxutos.
 */
export interface DependenciasAuth {
  usuarios: UsuarioRepository;
  sessoes: SessaoRepository;
  tokens: TokenRepository;
  desafios: DesafioRepository;
  auditoria: Auditoria;
  hash: HashDeSenha;
  limitador: LimitadorDeTaxa;
  segundoFator: SegundoFator;
  notificacoes: NotificacoesDeConta;
  clock: Clock;
  links: Links;
  politicaSessao: PoliticaSessao;
  emissor2fa: string;
}
