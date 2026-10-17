import { avisosDevidos, rotuloVencimento } from "../../lib/avisos.ts";
import { dataBR } from "../../lib/prazos/datas.ts";
import type { PapelNoEscritorio } from "../../lib/escritorio.ts";
import { AVISOS_PADRAO, type Intimacao, type PessoaEquipe } from "../../lib/types.ts";
import type { UsuarioRepository } from "../auth/ports.ts";
import type { AssinadorDeLinks } from "../core/assinatura.ts";
import { type Clock, DIA } from "../core/clock.ts";
import { AppError } from "../core/errors.ts";
import type { ArmazenamentoDocumentos } from "../infra/armazenamento.ts";
import { montarEmail } from "../infra/email/notificacoes.ts";
import type { EnviadorDeEmail } from "../infra/email/ports.ts";
import { hojeEmBrasilia } from "../rondas/ronda-comunica.ts";
import type { EspacoTrabalhoRepository } from "../workspace/espaco-trabalho.ts";

/** Por quanto tempo o link "Já cumpri" de um aviso vale. */
const VALIDADE_LINK = 30 * DIA;
/** Por quanto tempo lembramos que um aviso já foi enviado. */
const MEMORIA_ENVIOS = 90 * DIA;

export interface DepsAvisos {
  espacos: EspacoTrabalhoRepository;
  usuarios: Pick<UsuarioRepository, "porId" | "listarConfirmados">;
  enviador: EnviadorDeEmail;
  /** Guarda quais avisos já saíram, por conta. */
  registro: ArmazenamentoDocumentos;
  assinador: AssinadorDeLinks;
  clock: Clock;
  /** URL pública do Clepsa, para os links do e-mail. */
  urlApp: () => string;
  /** Papel da conta no escritório. Sem isto, cada conta recebe todos os prazos do espaço dela. */
  papelDe?: (usuarioId: string) => Promise<PapelNoEscritorio | null>;
  /** Contas do escritório da conta. */
  membros?: (usuarioId: string) => Promise<string[]>;
}

type Enviados = Record<string, string>;

interface DadosLink {
  u: string;
  i: string;
  [k: string]: unknown;
}

function horaEmBrasilia(agora: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(agora));
}

/** Avisos de prazo por e-mail e o botão "Já cumpri" que vem neles. */
export class AvisosService {
  private readonly d: DepsAvisos;

  constructor(deps: DepsAvisos) {
    this.d = deps;
  }

  private chaveRegistro(usuarioId: string) {
    if (!/^[0-9a-f-]{36}$/.test(usuarioId)) throw new Error("Identificador de usuário inválido.");
    return `avisos/${usuarioId}`;
  }

  /** Envia os avisos do dia de todas as contas que ligaram os avisos. */
  async rodar(): Promise<{ contas: number; emails: number }> {
    let emails = 0;
    const ids = await this.d.usuarios.listarConfirmados();
    for (const id of ids) {
      try {
        if (await this.daConta(id)) emails++;
      } catch (e) {
        console.error(`[avisos] falha na conta ${id}:`, e instanceof Error ? e.message : e);
      }
    }
    return { contas: ids.length, emails };
  }

  /**
   * Envia, se houver, o aviso de hoje de uma conta. `forcar` ignora a hora configurada e manda mesmo o
   * que já foi avisado (botão "Enviar aviso de teste"). Devolve quantos prazos foram no e-mail.
   */
  async daConta(usuarioId: string, op: { forcar?: boolean } = {}): Promise<number> {
    const espaco = await this.d.espacos.ler(usuarioId);
    const prefs = espaco.preferencias?.avisos ?? AVISOS_PADRAO;
    if (!prefs.ativo && !op.forcar) return 0;
    const agora = this.d.clock.agora();
    if (!op.forcar && horaEmBrasilia(agora) < prefs.hora) return 0;
    const usuario = await this.d.usuarios.porId(usuarioId);
    if (!usuario) return 0;

    const hoje = hojeEmBrasilia(agora);
    const enviados = await this.d.registro.ler<Enviados>(this.chaveRegistro(usuarioId), {});
    const devidos = avisosDevidos(await this.daPessoa(usuarioId, espaco.intimacoes, espaco.preferencias?.equipe ?? []), prefs, hoje, espaco.suspensoes ?? [], op.forcar ? new Set() : new Set(Object.keys(enviados)));
    if (!devidos.length) return 0;

    const base = this.d.urlApp();
    const expira = new Date(agora.getTime() + VALIDADE_LINK);
    await this.d.enviador.enviar(
      montarEmail(usuario.email, {
        assunto: devidos.length === 1 ? `Prazo ${rotuloVencimento(devidos[0].diasUteis)}: ${devidos[0].intimacao.numeroProcesso}` : `${devidos.length} prazos chegando · Clepsa`,
        titulo: devidos.length === 1 ? "Um prazo está chegando" : `${devidos.length} prazos estão chegando`,
        paragrafos: ["Confira abaixo. Quando cumprir, toque em “Já cumpri” e o Clepsa para de avisar."],
        itens: devidos.map(({ intimacao: i, diasUteis }) => ({
          titulo: `${i.cliente} · ${rotuloVencimento(diasUteis)} (${dataBR(i.prazo!)})`,
          linhas: [`Processo ${i.numeroProcesso} · ${i.tribunal} · ${i.orgao}`, resumoCurto(i)],
          botoes: [
            { rotulo: "Já cumpri", url: `${base}/cumprir#token=${this.d.assinador.assinar({ u: usuarioId, i: i.id }, expira)}`, destaque: true },
            { rotulo: "Abrir no Clepsa", url: `${base}/intimacoes/${i.id}` },
          ],
        })),
        rodape: "Você recebe estes avisos porque os ligou em Prazos e avisos. Para mudar os dias ou desligar, acesse a mesma página.",
      }),
    );

    if (!op.forcar) {
      const limite = new Date(agora.getTime() - MEMORIA_ENVIOS).toISOString();
      await this.d.registro.alterar<Enviados>(this.chaveRegistro(usuarioId), {}, (atual) => {
        const novo: Enviados = Object.fromEntries(Object.entries(atual).filter(([, em]) => em >= limite));
        for (const d of devidos) for (const k of d.chaves) novo[k] = agora.toISOString();
        return { valor: novo, resultado: undefined };
      });
    }
    return devidos.length;
  }

  /**
   * Num escritório com várias contas, cada uma recebe os prazos de que é responsável. Os sem
   * responsável, ou entregues a alguém da lista que não tem acesso ao Clepsa, vão para os donos
   * (num escritório de uma pessoa só, isso é tudo, como sempre foi).
   */
  private async daPessoa(usuarioId: string, intimacoes: Intimacao[], equipe: PessoaEquipe[]): Promise<Intimacao[]> {
    if (!this.d.papelDe || !this.d.membros) return intimacoes;
    const [papel, membros] = await Promise.all([this.d.papelDe(usuarioId), this.d.membros(usuarioId)]);
    const contas = new Set(membros);
    const minha = equipe.find((p) => p.usuarioId === usuarioId);
    const comAcesso = new Set(equipe.filter((p) => p.usuarioId && contas.has(p.usuarioId) && !p.inativa).map((p) => p.id));
    return intimacoes.filter((i) => (minha && i.responsavelId === minha.id) || (papel === "dono" && !(i.responsavelId && comAcesso.has(i.responsavelId))));
  }

  private abrir(token: string): DadosLink {
    const dados = this.d.assinador.verificar<DadosLink>(token, this.d.clock.agora());
    if (!dados || typeof dados.u !== "string" || typeof dados.i !== "string") throw new AppError("token_invalido", "Este link não vale mais. Abra a intimação no Clepsa para marcá-la.");
    return dados;
  }

  /** O que o link "Já cumpri" vai marcar, para a página de confirmação mostrar antes. */
  async consultar(token: string) {
    const { u, i } = this.abrir(token);
    const intimacao = (await this.d.espacos.ler(u)).intimacoes.find((x) => x.id === i);
    if (!intimacao) throw new AppError("nao_encontrado", "Esta intimação não existe mais.");
    return resumoPublico(intimacao);
  }

  /** Marca a intimação do link como respondida. Repetir não muda nada. */
  async cumprir(token: string) {
    const { u, i } = this.abrir(token);
    for (let tentativa = 0; ; tentativa++) {
      const espaco = await this.d.espacos.ler(u);
      const alvo = espaco.intimacoes.find((x) => x.id === i);
      if (!alvo) throw new AppError("nao_encontrado", "Esta intimação não existe mais.");
      if (alvo.status === "respondida" || alvo.status === "arquivada") return resumoPublico(alvo);
      const agora = this.d.clock.agora();
      const nota = `Marcada como cumprida pelo link do aviso em ${agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}.`;
      const atualizada: Intimacao = { ...alvo, status: "respondida", observacoes: [alvo.observacoes, nota].filter(Boolean).join("\n"), updatedAt: agora.toISOString() };
      try {
        await this.d.espacos.salvar(u, { intimacoes: espaco.intimacoes.map((x) => (x.id === i ? atualizada : x)), termos: espaco.termos }, espaco.revisao);
        return resumoPublico(atualizada);
      } catch (e) {
        if (e instanceof AppError && e.codigo === "conflito" && tentativa < 4) continue;
        throw e;
      }
    }
  }
}

function resumoCurto(i: Intimacao): string {
  if (i.resumo) return i.resumo.texto.replace("\n", " ");
  const t = (i.texto ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 180 ? `${t.slice(0, 180).trimEnd()}…` : t;
}

/** Só o necessário para a página pública de confirmação, sem o inteiro teor. */
function resumoPublico(i: Intimacao) {
  return { processo: i.numeroProcesso, cliente: i.cliente, prazo: i.prazo ?? null, status: i.status };
}
