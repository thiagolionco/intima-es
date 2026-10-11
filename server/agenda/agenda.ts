import type { Intimacao, PessoaEquipe } from "../../lib/types.ts";
import type { AssinadorDeLinks } from "../core/assinatura.ts";
import type { Clock } from "../core/clock.ts";
import { MINUTO } from "../core/clock.ts";
import type { Cofre } from "../core/cofre.ts";
import { AppError } from "../core/errors.ts";
import type { ArmazenamentoDocumentos } from "../infra/armazenamento.ts";
import type { EspacoTrabalhoRepository } from "../workspace/espaco-trabalho.ts";
import { type ClienteGoogle, ErroGoogle, type EventoAgenda } from "./google.ts";

export const NOME_AGENDA = "Prazos · Clepsa";
/** Espera depois de uma gravação antes de atualizar a agenda, para juntar várias mudanças seguidas. */
const ESPERA_APOS_SALVAR_MS = 15_000;
/** Máximo de chamadas à Agenda numa sincronização; o resto fica para a próxima. */
const MAXIMO_OPERACOES = 300;

interface EventoGravado {
  id: string;
  /** Conteúdo do evento da última vez que foi enviado, para só mexer no que mudou. */
  assinatura: string;
}

interface Conexao {
  /** Token de renovação do Google, cifrado. */
  refresh: string;
  agendaId?: string;
  conectadoEm: string;
  eventos: Record<string, EventoGravado>;
  ultimaSincronizacao?: string;
  erro?: string;
}

export interface EstadoAgenda {
  disponivel: boolean;
  conectado: boolean;
  conectadoEm?: string;
  prazosNaAgenda?: number;
  ultimaSincronizacao?: string;
  erro?: string;
}

export interface DepsAgenda {
  /** Ausente quando GOOGLE_CLIENT_ID/SECRET não estão configurados. */
  google?: ClienteGoogle;
  espacos: EspacoTrabalhoRepository;
  documentos: ArmazenamentoDocumentos;
  cofre: Cofre;
  assinador: AssinadorDeLinks;
  clock: Clock;
  listarUsuarios: () => Promise<string[]>;
  urlApp: () => string;
}

const emAberto = (i: Intimacao) => (i.status === "nova" || i.status === "em_analise") && !!i.prazo;

/** O evento de um prazo. Vai só o necessário para trabalhar, nunca o inteiro teor. */
export function eventoDoPrazo(i: Intimacao, equipe: PessoaEquipe[], urlApp: string): EventoAgenda {
  const responsavel = i.responsavelId ? equipe.find((p) => p.id === i.responsavelId)?.nome : undefined;
  const linhas = [
    `Processo ${i.numeroProcesso}`,
    [i.tribunal, i.orgao].filter(Boolean).join(" · "),
    i.tipoDocumento && `Documento: ${i.tipoDocumento}`,
    responsavel && `Responsável: ${responsavel}`,
    i.resumo && `\n${i.resumo.texto}`,
    `\nAbrir no Clepsa: ${urlApp}/intimacoes/${i.id}`,
  ];
  return { titulo: `Prazo: ${i.cliente} · ${i.numeroProcesso}`, descricao: linhas.filter(Boolean).join("\n"), data: i.prazo! };
}

const assinar = (e: EventoAgenda) => JSON.stringify([e.titulo, e.descricao, e.data]);
const sumiu = (e: unknown) => e instanceof ErroGoogle && (e.status === 404 || e.status === 410);
const acessoPerdido = (e: unknown) => e instanceof ErroGoogle && (e.status === 400 || e.status === 401) && /invalid_grant|unauthorized|invalid_token/i.test(e.message);

/** Liga a conta à Google Agenda e mantém os prazos em aberto como eventos de dia inteiro. */
export class AgendaService {
  private readonly d: DepsAgenda;
  private readonly emAndamento = new Map<string, Promise<void>>();
  private readonly esperando = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(deps: DepsAgenda) {
    this.d = deps;
  }

  get disponivel() {
    return !!this.d.google;
  }

  private chave(usuarioId: string) {
    if (!/^[0-9a-f-]{36}$/.test(usuarioId)) throw new Error("Identificador de usuário inválido.");
    return `google/${usuarioId}`;
  }

  private google(): ClienteGoogle {
    if (!this.d.google) throw new AppError("indisponivel", "A Google Agenda não está configurada neste servidor.");
    return this.d.google;
  }

  private lerConexao(usuarioId: string) {
    return this.d.documentos.ler<Conexao | null>(this.chave(usuarioId), null);
  }

  /** Endereço da tela de consentimento do Google para esta conta. */
  iniciar(usuarioId: string, redirectUri: string): string {
    const state = this.d.assinador.assinar({ u: usuarioId, f: "google" }, new Date(this.d.clock.agora().getTime() + 15 * MINUTO));
    return this.google().urlConsentimento({ redirectUri, state });
  }

  /** Volta do Google: confere que o pedido saiu desta conta, guarda o acesso (cifrado) e já sincroniza. */
  async concluir(usuarioId: string, state: string, codigo: string, redirectUri: string): Promise<void> {
    const dados = this.d.assinador.verificar<{ u: string; f: string }>(state, this.d.clock.agora());
    if (!dados || dados.f !== "google" || dados.u !== usuarioId) throw new AppError("token_invalido", "O pedido de conexão expirou ou não é desta conta. Tente conectar de novo.");
    const { refreshToken } = await this.google().trocarCodigo(codigo, redirectUri);
    const anterior = await this.lerConexao(usuarioId);
    if (anterior) await this.google().revogar(this.d.cofre.decifrar(anterior.refresh));
    await this.d.documentos.alterar<Conexao | null>(this.chave(usuarioId), null, () => ({
      valor: { refresh: this.d.cofre.cifrar(refreshToken), conectadoEm: this.d.clock.agora().toISOString(), eventos: {} },
      resultado: undefined,
    }));
    await this.sincronizar(usuarioId).catch((e) => console.error("[agenda] primeira sincronização falhou:", e instanceof Error ? e.message : e));
  }

  async estado(usuarioId: string): Promise<EstadoAgenda> {
    const c = await this.lerConexao(usuarioId);
    if (!c) return { disponivel: this.disponivel, conectado: false };
    return { disponivel: this.disponivel, conectado: true, conectadoEm: c.conectadoEm, prazosNaAgenda: Object.keys(c.eventos).length, ultimaSincronizacao: c.ultimaSincronizacao, erro: c.erro };
  }

  /** Desliga a conta do Google. A agenda "Prazos · Clepsa" continua no Google e pode ser apagada por lá. */
  async desconectar(usuarioId: string): Promise<void> {
    const c = await this.lerConexao(usuarioId);
    clearTimeout(this.esperando.get(usuarioId));
    if (c && this.d.google) await this.d.google.revogar(this.d.cofre.decifrar(c.refresh));
    await this.d.documentos.remover(this.chave(usuarioId));
  }

  /** Pede uma sincronização daqui a pouco (chamado a cada gravação da tela). */
  agendar(usuarioId: string): void {
    if (!this.d.google) return;
    clearTimeout(this.esperando.get(usuarioId));
    const t = setTimeout(() => {
      this.esperando.delete(usuarioId);
      this.sincronizar(usuarioId).catch((e) => console.error("[agenda] falha:", e instanceof Error ? e.message : e));
    }, ESPERA_APOS_SALVAR_MS);
    t.unref?.();
    this.esperando.set(usuarioId, t);
  }

  /** Sincroniza todas as contas conectadas (rodado de hora em hora). */
  async rodar(): Promise<{ contas: number }> {
    if (!this.d.google) return { contas: 0 };
    let contas = 0;
    for (const id of await this.d.listarUsuarios()) {
      if (!(await this.lerConexao(id))) continue;
      contas++;
      await this.sincronizar(id).catch((e) => console.error(`[agenda] falha na conta ${id}:`, e instanceof Error ? e.message : e));
    }
    return { contas };
  }

  /** Uma sincronização por conta de cada vez; quem chega durante uma espera a mesma. */
  sincronizar(usuarioId: string): Promise<void> {
    const atual = this.emAndamento.get(usuarioId);
    if (atual) return atual;
    const p = this.sincronizarAgora(usuarioId).finally(() => this.emAndamento.delete(usuarioId));
    this.emAndamento.set(usuarioId, p);
    return p;
  }

  private async sincronizarAgora(usuarioId: string): Promise<void> {
    const google = this.google();
    const conexao = await this.lerConexao(usuarioId);
    if (!conexao) throw new AppError("nao_encontrado", "Conecte a Google Agenda primeiro.");

    const espaco = await this.d.espacos.ler(usuarioId);
    const urlApp = this.d.urlApp();
    const desejados = new Map(espaco.intimacoes.filter(emAberto).map((i) => [i.id, eventoDoPrazo(i, espaco.preferencias?.equipe ?? [], urlApp)]));

    let acesso: string;
    try {
      acesso = await google.acessar(this.d.cofre.decifrar(conexao.refresh));
    } catch (e) {
      const erro = acessoPerdido(e) ? "O acesso à Google Agenda foi retirado. Conecte de novo." : "Não foi possível falar com o Google. Tentaremos de novo.";
      await this.gravar(usuarioId, (c) => ({ ...c, erro }));
      throw e;
    }

    let agendaId = conexao.agendaId;
    const eventos = { ...conexao.eventos };
    let operacoes = 0;
    let erro: string | undefined;

    const criarAgenda = async () => {
      agendaId = await google.criarAgenda(acesso, NOME_AGENDA);
      for (const k of Object.keys(eventos)) delete eventos[k];
    };

    try {
      if (!agendaId) await criarAgenda();

      // Tira da agenda o que não está mais em aberto (cumprido, arquivado, sem prazo ou excluído).
      for (const [intimacaoId, ev] of Object.entries(eventos)) {
        if (desejados.has(intimacaoId)) continue;
        if (operacoes++ >= MAXIMO_OPERACOES) break;
        await google.apagarEvento(acesso, agendaId!, ev.id).catch((e) => {
          if (!sumiu(e)) throw e;
        });
        delete eventos[intimacaoId];
      }

      for (const [intimacaoId, ev] of desejados) {
        const assinatura = assinar(ev);
        const gravado = eventos[intimacaoId];
        if (gravado?.assinatura === assinatura) continue;
        if (operacoes++ >= MAXIMO_OPERACOES) break;
        if (gravado) {
          try {
            await google.atualizarEvento(acesso, agendaId!, gravado.id, ev);
            eventos[intimacaoId] = { id: gravado.id, assinatura };
            continue;
          } catch (e) {
            if (!sumiu(e)) throw e;
            // O evento foi apagado no Google: cria de novo abaixo.
          }
        }
        try {
          eventos[intimacaoId] = { id: await google.criarEvento(acesso, agendaId!, ev), assinatura };
        } catch (e) {
          if (!sumiu(e)) throw e;
          // A agenda inteira foi apagada no Google: cria outra e recomeça na próxima rodada.
          await criarAgenda();
          eventos[intimacaoId] = { id: await google.criarEvento(acesso, agendaId!, ev), assinatura };
        }
      }
    } catch (e) {
      erro = acessoPerdido(e) ? "O acesso à Google Agenda foi retirado. Conecte de novo." : `Parte dos prazos não foi para a agenda (${e instanceof Error ? e.message : "erro"}). Tentaremos de novo.`;
      console.error("[agenda] sincronização incompleta:", e instanceof Error ? e.message : e);
    }

    await this.gravar(usuarioId, (c) => ({ ...c, agendaId, eventos, ultimaSincronizacao: this.d.clock.agora().toISOString(), erro }));
  }

  /** Grava o resultado sem ressuscitar uma conexão desfeita enquanto a sincronização rodava. */
  private gravar(usuarioId: string, fn: (c: Conexao) => Conexao) {
    return this.d.documentos.alterar<Conexao | null>(this.chave(usuarioId), null, (c) => ({ valor: c ? fn(c) : null, resultado: undefined }));
  }
}
