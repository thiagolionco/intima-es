import { ACAO_AGENTE_LABEL, type AcaoAgente, ACOES_AGENTE, type EntregaAgente, type ExecucaoAgente, LIMITES_AGENTE, type PassoAgente } from "../../lib/agente.ts";
import { NIVEL_RISCO_LABEL } from "../../lib/processos.ts";
import { blocoDosPadroes } from "../../lib/padroes.ts";
import { contarPendencias } from "../../lib/citacoes.ts";
import type { Clock } from "../core/clock.ts";
import { novoId } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import type { AnalisesService } from "../processos/analises.ts";
import type { MovimentacoesService } from "../processos/movimentacoes.ts";
import type { PareceresService } from "../processos/pareceres.ts";
import type { RedacaoParecerService } from "../processos/redacao-parecer.ts";
import { idValido, nomeDoAutor, type Registro, type RegistrosRepository, textoLimpo } from "../registros/registros.ts";
import type { CitacoesService } from "./citacoes.ts";
import { type ContextoProcesso, descreverProcesso, Exclusivo, falhaDaIa, semIa } from "./contexto-processo.ts";
import { perguntarJson, type ServicoIa } from "./ia.ts";
import type { LinhaDoTempoService } from "./linha-do-tempo.ts";
import type { PadroesService } from "./padroes.ts";
import type { PesquisaService } from "./pesquisa.ts";
import type { ProvidenciasService } from "./providencias.ts";

const INSTRUCOES_PLANO = `Você é o assistente de um escritório de advocacia brasileiro e planeja como atender a um pedido sobre um processo.
Você só pode usar estas ferramentas, uma por passo:
${ACOES_AGENTE.map((a) => `- ${a}: ${ACAO_AGENTE_LABEL[a]}`).join("\n")}
Regras:
- Use o mínimo de passos que atende ao pedido (no máximo ${LIMITES_AGENTE.passos}), na ordem em que fazem sentido (por exemplo, pesquisar antes de redigir; redigir antes de verificar citações).
- "verificar_citacoes" só depois de "redigir_parecer" ou se o processo já tiver parecer.
- Ferramentas que leem PDFs (analisar_risco, linha_do_tempo, providencias) só servem se houver PDF anexado.
- Em cada passo, escreva o objetivo em uma frase: para "pesquisar", a pergunta exata; para "redigir_parecer" e "resumo_cliente", a orientação.
- Na explicação, diga em até 3 frases o que vai fazer e o que vai entregar.
- Se o pedido não tiver relação com o processo ou não puder ser atendido com essas ferramentas, devolva zero passos e explique por quê.`;

const ESQUEMA_PLANO = {
  type: "object",
  additionalProperties: false,
  required: ["explicacao", "passos"],
  properties: {
    explicacao: { type: "string" },
    passos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["acao", "objetivo"],
        properties: { acao: { type: "string", enum: ACOES_AGENTE }, objetivo: { type: "string" } },
      },
    },
  },
};

const INSTRUCOES_CLIENTE = `Escreva uma atualização curta do processo para o cliente do escritório, em português simples, como uma mensagem de e-mail.
Diga o que aconteceu, em que pé está, o que vem a seguir e se o cliente precisa fazer algo. Sem termos técnicos sem explicação, sem prometer resultado, sem inventar fatos.
Não inclua saudação com nome de advogado nem assinatura.`;

const INSTRUCOES_ENTREGA = `Você revisa o trabalho do assistente de um escritório de advocacia antes de entregá-lo ao advogado.
Recebe o pedido original e o resultado de cada passo. Escreva:
- texto: a entrega para o advogado, em até 15 frases ou uma lista curta, dizendo o que foi feito, o que foi achado e onde encontrar cada resultado no Clepsa (aba Linha do tempo, Providências, Risco, Parecer).
- pendencias: o que ficou faltando, falhou ou precisa de conferência humana (citações não confirmadas, passos com erro, falta de PDF).
- atendeu: se o pedido foi atendido por inteiro.
Não invente resultados que os passos não mostram.`;

const ESQUEMA_ENTREGA = {
  type: "object",
  additionalProperties: false,
  required: ["texto", "pendencias", "atendeu"],
  properties: { texto: { type: "string" }, pendencias: { type: "array", items: { type: "string" } }, atendeu: { type: "boolean" } },
};

type Valor = Omit<ExecucaoAgente, "id" | "processoId" | "criadoEm" | "atualizadoEm">;

const paraExecucao = (r: Registro<Valor>): ExecucaoAgente => ({ ...r.valor, id: r.id, processoId: r.processoId!, criadoEm: r.criadoEm, atualizadoEm: r.atualizadoEm });

export interface FerramentasAgente {
  analises: AnalisesService;
  linhaDoTempo: LinhaDoTempoService;
  providencias: ProvidenciasService;
  pesquisa: PesquisaService;
  redacao: RedacaoParecerService;
  pareceres: PareceresService;
  citacoes: CitacoesService;
  movimentacoes: MovimentacoesService;
}

/** Assistente do caso: plano aprovado pelo advogado, um passo por chamada e entrega revisada. */
export class AgenteService {
  private readonly repo: RegistrosRepository;
  private readonly contexto: ContextoProcesso;
  private readonly padroes: PadroesService;
  private readonly f: FerramentasAgente;
  private readonly ia?: ServicoIa;
  private readonly clock: Clock;
  private readonly limitar: (usuarioId: string) => void;
  private readonly exclusivo = new Exclusivo();

  constructor(d: { repo: RegistrosRepository; contexto: ContextoProcesso; padroes: PadroesService; ferramentas: FerramentasAgente; ia?: ServicoIa; clock: Clock; limitar?: (usuarioId: string) => void }) {
    this.repo = d.repo;
    this.contexto = d.contexto;
    this.padroes = d.padroes;
    this.f = d.ferramentas;
    this.ia = d.ia;
    this.clock = d.clock;
    this.limitar = d.limitar ?? (() => undefined);
  }

  get disponivel() {
    return !!this.ia;
  }

  private exigirIa(): ServicoIa {
    if (!this.ia) throw semIa("O assistente");
    return this.ia;
  }

  private async exigir(usuarioId: string, processoId: string, id: string): Promise<Registro<Valor>> {
    const r = idValido(id) ? await this.repo.obter<Valor>(usuarioId, "execucao_agente", id) : null;
    if (!r || r.processoId !== processoId) throw new AppError("nao_encontrado", "Pedido ao assistente não encontrado.");
    return r;
  }

  async listar(usuarioId: string, processoId: string): Promise<ExecucaoAgente[]> {
    await this.contexto.processo(usuarioId, processoId);
    return (await this.repo.listar<Valor>(usuarioId, "execucao_agente", { processoId })).map(paraExecucao).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }

  /** Planeja. Nada é executado até o advogado mandar rodar cada passo. */
  async planejar(autor: { id: string; nome: string }, processoId: string, corpo: unknown): Promise<ExecucaoAgente> {
    const ia = this.exigirIa();
    const pedido = textoLimpo((corpo as { pedido?: unknown } | null)?.pedido, LIMITES_AGENTE.pedido);
    if (!pedido) throw new AppError("dados_invalidos", "Escreva o que o assistente deve fazer.", { campo: "pedido" });
    const processo = await this.contexto.processo(autor.id, processoId);
    const pdfs = (await this.contexto.listarPdfs(autor.id, processoId)).length;
    const anteriores = await this.repo.listar(autor.id, "execucao_agente", { processoId });
    const [parecer] = await this.f.pareceres.listar(autor.id, processoId);
    this.limitar(autor.id);
    const padroes = await this.padroes.instrucoes(autor.id, "agente");
    let plano: { explicacao: string; passos: { acao: AcaoAgente; objetivo: string }[] };
    try {
      const { dados } = await perguntarJson<typeof plano>(ia, {
        sistema: INSTRUCOES_PLANO,
        esquema: ESQUEMA_PLANO,
        esforco: "medium",
        blocos: [
          {
            tipo: "texto",
            texto: [
              `Dados do processo:\n${descreverProcesso(processo)}`,
              `PDFs anexados: ${pdfs || "nenhum"}.`,
              parecer ? `O processo já tem parecer (versão ${parecer.versao}).` : "O processo ainda não tem parecer.",
              blocoDosPadroes(padroes),
              `Pedido do advogado: ${pedido}`,
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
      });
      plano = dados;
    } catch (e) {
      throw falhaDaIa("agente", e);
    }
    const passos: PassoAgente[] = (Array.isArray(plano.passos) ? plano.passos : [])
      .filter((p) => ACOES_AGENTE.includes(p.acao))
      .slice(0, LIMITES_AGENTE.passos)
      .map((p) => ({ id: novoId(), acao: p.acao, objetivo: textoLimpo(p.objetivo, 600) ?? ACAO_AGENTE_LABEL[p.acao], estado: "pendente" }));
    const agora = this.clock.agora().toISOString();
    // Guarda as mais recentes: as antigas além do limite vão embora.
    const velhas = anteriores.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)).slice(0, Math.max(0, anteriores.length - LIMITES_AGENTE.porProcesso + 1));
    for (const v of velhas) await this.repo.excluir(autor.id, "execucao_agente", v.id);
    const r: Registro<Valor> = {
      id: novoId(),
      tipo: "execucao_agente",
      processoId,
      valor: { pedido, explicacao: textoLimpo(plano.explicacao, 1500) ?? "", passos, modelo: ia.modelo, autorId: autor.id, autorNome: nomeDoAutor(autor.nome) },
      criadoEm: agora,
      atualizadoEm: agora,
    };
    await this.repo.gravar(autor.id, r);
    return paraExecucao(r);
  }

  /** Executa um passo do plano com a ferramenta do Clepsa correspondente. */
  async executarPasso(autor: { id: string; nome: string }, processoId: string, id: string, passoId: string, corpo?: unknown): Promise<ExecucaoAgente> {
    const ia = this.exigirIa();
    const atual = await this.exigir(autor.id, processoId, id);
    const passo = atual.valor.passos.find((p) => p.id === passoId);
    if (!passo) throw new AppError("nao_encontrado", "Passo não encontrado.");
    const pular = (corpo as { pular?: unknown } | null)?.pular === true;
    return this.exclusivo.executar(id, "O assistente já está trabalhando neste pedido.", async () => {
      let resultado: Pick<PassoAgente, "estado" | "resumo" | "texto" | "erro">;
      if (pular) resultado = { estado: "pulado", resumo: "Pulado pelo advogado." };
      else {
        try {
          resultado = { estado: "feito", ...(await this.rodar(autor, processoId, passo, atual.valor, ia)) };
        } catch (e) {
          resultado = { estado: "erro", erro: e instanceof AppError ? e.message : falhaDaIa("agente", e).message };
        }
      }
      const agora = this.clock.agora().toISOString();
      const salvo = await this.repo.alterar<Valor>(
        autor.id,
        "execucao_agente",
        id,
        (r) => ({ ...r.valor, passos: r.valor.passos.map((p) => (p.id === passoId ? { id: p.id, acao: p.acao, objetivo: p.objetivo, ...resultado, concluidoEm: agora } : p)) }),
        agora,
      );
      if (!salvo) throw new AppError("nao_encontrado", "Pedido ao assistente não encontrado.");
      return paraExecucao(salvo);
    });
  }

  private async rodar(autor: { id: string; nome: string }, processoId: string, passo: PassoAgente, exec: Valor, ia: ServicoIa): Promise<{ resumo: string; texto?: string }> {
    switch (passo.acao) {
      case "analisar_risco": {
        const a = await this.f.analises.analisar(autor, processoId);
        return { resumo: `Risco ${NIVEL_RISCO_LABEL[a.nivel].toLowerCase()}: ${a.justificativa}`.slice(0, 600) };
      }
      case "linha_do_tempo": {
        const f = await this.f.linhaDoTempo.extrairFatos(autor, processoId);
        return { resumo: `${f.fatos.length} fatos com data tirados de ${f.documentos.length} PDF(s). Estão na aba Linha do tempo.` };
      }
      case "providencias": {
        const r = await this.f.providencias.extrair(autor, processoId);
        return { resumo: `${r.novas} providência(s) sugerida(s) na aba Providências, para confirmar.` };
      }
      case "pesquisar": {
        const processo = await this.contexto.processo(autor.id, processoId);
        const r = await this.f.pesquisa.pesquisar(autor.id, { pergunta: passo.objetivo }, descreverProcesso(processo));
        const fontes = r.fontes.map((x) => `- ${x.referencia}${x.tribunal ? ` (${x.tribunal})` : ""}: ${x.resumo} ${x.url}`).join("\n");
        return { resumo: `${r.fontes.length} fonte(s) oficial(is) encontrada(s).`, texto: `${r.resposta}${fontes ? `\n\nFontes:\n${fontes}` : ""}` };
      }
      case "redigir_parecer": {
        const pesquisa = exec.passos.find((p) => p.acao === "pesquisar" && p.estado === "feito")?.texto;
        const orientacao = [passo.objetivo, pesquisa && `Use o resultado desta pesquisa, citando só o que tem fonte:\n${pesquisa}`].filter(Boolean).join("\n\n").slice(0, 2000);
        const r = await this.f.redacao.redigir(autor.id, processoId, { itens: [], orientacao });
        return { resumo: "Rascunho pronto. Abra no editor do parecer para revisar e salvar.", texto: r.texto };
      }
      case "verificar_citacoes": {
        const rascunho = exec.passos.find((p) => p.acao === "redigir_parecer" && p.estado === "feito")?.texto;
        const texto = rascunho ?? (await this.f.pareceres.listar(autor.id, processoId))[0]?.texto;
        if (!texto) throw new AppError("dados_invalidos", "Não há parecer nem rascunho para verificar.");
        const v = await this.f.citacoes.verificar(autor, { texto, processoId });
        const pend = contarPendencias(v);
        return { resumo: `${v.citacoes.length} citação(ões) conferida(s); ${pend ? `${pend} pedem atenção` : "nenhuma pendência"}.` };
      }
      case "resumo_cliente": {
        const processo = await this.contexto.processo(autor.id, processoId);
        const mov = await this.f.movimentacoes.obter(autor.id, processoId).catch(() => null);
        const fatos = await this.f.linhaDoTempo.fatos(autor.id, processoId);
        const [parecer] = await this.f.pareceres.listar(autor.id, processoId);
        const padroes = await this.padroes.instrucoes(autor.id, "agente");
        this.limitar(autor.id);
        const r = await ia.perguntar({
          sistema: INSTRUCOES_CLIENTE,
          esforco: "medium",
          blocos: [
            {
              tipo: "texto",
              texto: [
                `Dados do processo:\n${descreverProcesso(processo)}`,
                mov?.movimentos.length && `Últimos andamentos:\n${mov.movimentos.slice(0, 10).map((m) => `- ${m.dataHora.slice(0, 10)}: ${m.nome}`).join("\n")}`,
                fatos?.fatos.length && `Fatos do processo:\n${fatos.fatos.map((f) => `- ${f.data}: ${f.descricao}`).join("\n")}`,
                parecer && `Parecer interno (não copie, use só para entender a estratégia):\n${parecer.texto.slice(0, 6000)}`,
                blocoDosPadroes(padroes),
                `Orientação: ${passo.objetivo}`,
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
          ],
        });
        return { resumo: "Atualização para o cliente pronta para revisar e enviar.", texto: r.texto.trim() };
      }
    }
  }

  /** Revisa os resultados contra o pedido e escreve a entrega. */
  async entregar(autor: { id: string; nome: string }, processoId: string, id: string): Promise<ExecucaoAgente> {
    const ia = this.exigirIa();
    const atual = await this.exigir(autor.id, processoId, id);
    if (atual.valor.passos.some((p) => p.estado === "pendente")) throw new AppError("dados_invalidos", "Ainda há passos para executar ou pular.");
    this.limitar(autor.id);
    let entrega: EntregaAgente;
    try {
      const { dados } = await perguntarJson<EntregaAgente>(ia, {
        sistema: INSTRUCOES_ENTREGA,
        esquema: ESQUEMA_ENTREGA,
        esforco: "medium",
        blocos: [
          {
            tipo: "texto",
            texto: `Pedido: ${atual.valor.pedido}\n\nPassos:\n${atual.valor.passos
              .map((p, i) => `${i + 1}. ${ACAO_AGENTE_LABEL[p.acao]} (${p.estado}): ${p.resumo ?? p.erro ?? ""}${p.texto ? `\n   Texto produzido: ${p.texto.slice(0, 3000)}` : ""}`)
              .join("\n")}`,
          },
        ],
      });
      entrega = {
        texto: textoLimpo(dados.texto, 6000) ?? "",
        pendencias: (Array.isArray(dados.pendencias) ? dados.pendencias : []).flatMap((x) => textoLimpo(x, 400) ?? []).slice(0, 10),
        atendeu: dados.atendeu === true,
      };
    } catch (e) {
      throw falhaDaIa("agente", e);
    }
    const salvo = await this.repo.alterar<Valor>(autor.id, "execucao_agente", id, (r) => ({ ...r.valor, entrega }), this.clock.agora().toISOString());
    if (!salvo) throw new AppError("nao_encontrado", "Pedido ao assistente não encontrado.");
    return paraExecucao(salvo);
  }

  async excluir(usuarioId: string, processoId: string, id: string) {
    await this.exigir(usuarioId, processoId, id);
    await this.repo.excluir(usuarioId, "execucao_agente", id);
  }
}
