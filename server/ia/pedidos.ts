import { blocoDosPadroes } from "../../lib/padroes.ts";
import { type FormularioPedidos, LIMITES_PEDIDO, type OrigemPedido, type Pedido, type StatusPedido, type TriagemPedido, type Urgencia } from "../../lib/pedidos.ts";
import { AREA_LABEL, type AreaAtuacao, type Processo } from "../../lib/processos.ts";
import { HORA, DIA, type Clock } from "../core/clock.ts";
import { novoId, sha256, tokenAleatorio } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import type { ArmazenamentoDocumentos } from "../infra/armazenamento.ts";
import { idValido, nomeDoAutor, type Registro, type RegistrosRepository, textoLimpo } from "../registros/registros.ts";
import { falhaDaIa, semIa } from "./contexto-processo.ts";
import { perguntarJson, type ServicoIa } from "./ia.ts";
import { comUsoIa } from "./uso.ts";
import type { PadroesService } from "./padroes.ts";

const INSTRUCOES_TRIAGEM = `Você faz a triagem de pedidos que chegam a um escritório de advocacia brasileiro (de clientes ou de interessados).
Leia o relato e devolva:
- area: a área do direito (${Object.keys(AREA_LABEL).join(", ")}).
- urgencia: "alta" se houver prazo correndo, audiência próxima, prisão, bloqueio de contas, despejo ou risco de prescrição; "media" se precisar de resposta em poucos dias; "baixa" no resto.
- resumo: o pedido em até 3 frases, objetivas, para o advogado.
- perguntas: até 6 perguntas que o advogado faria antes de aceitar o caso (documentos, datas, valores).
- alertaPrazo: se o relato indica prazo ou prescrição perto, diga qual em uma frase; senão, vazio.
Não dê parecer jurídico nem prometa resultado. Use só o que está no relato.`;

const ESQUEMA_TRIAGEM = {
  type: "object",
  additionalProperties: false,
  required: ["area", "urgencia", "resumo", "perguntas", "alertaPrazo"],
  properties: {
    area: { type: "string", enum: Object.keys(AREA_LABEL) },
    urgencia: { type: "string", enum: ["baixa", "media", "alta"] },
    resumo: { type: "string" },
    perguntas: { type: "array", items: { type: "string" } },
    alertaPrazo: { type: "string" },
  },
};

const INSTRUCOES_RESPOSTA = `Escreva o rascunho da resposta do escritório a um pedido de atendimento, em português simples e cordial, como um e-mail curto.
Agradeça o contato, diga que o caso está sendo analisado, peça as informações e documentos que faltam (use as perguntas da triagem) e proponha o próximo passo (reunião ou envio de documentos).
Não dê parecer jurídico, não prometa resultado e não cite valores de honorários. Não assine com nome de advogado.`;

type ValorPedido = Omit<Pedido, "id" | "criadoEm" | "atualizadoEm">;
type ValorFormulario = Omit<FormularioPedidos, "id" | "criadoEm">;

/** O que fica guardado fora do escritório, achado pelo hash do token do link público. */
interface ChaveFormulario {
  usuarioId: string;
  formularioId: string;
}

const STATUS: StatusPedido[] = ["novo", "em_analise", "respondido", "convertido", "arquivado"];
const paraPedido = (r: Registro<ValorPedido>): Pedido => ({ ...r.valor, id: r.id, criadoEm: r.criadoEm, atualizadoEm: r.atualizadoEm });
const naoEncontrado = () => new AppError("nao_encontrado", "Pedido não encontrado.");
const chaveToken = (token: string) => `formulario-pedidos/${sha256(token)}`;

export interface DadosNovoPedido {
  origem: OrigemPedido;
  nome: unknown;
  contato: unknown;
  assunto: unknown;
  descricao: unknown;
  processoOrigemId?: string;
}

/**
 * Pedidos que chegam ao escritório: formulário público, mensagem do portal do cliente ou cadastro
 * à mão. A IA faz a triagem (área, urgência, perguntas) e o advogado decide o que fazer.
 */
export class PedidosService {
  private readonly repo: RegistrosRepository;
  private readonly chaves: ArmazenamentoDocumentos;
  private readonly padroes: PadroesService;
  private readonly ia?: ServicoIa;
  private readonly clock: Clock;
  private readonly limitar: (chave: string, limite: number, janelaMs: number) => void;
  private readonly criarProcesso: (usuarioId: string, dados: Record<string, unknown>) => Promise<Processo>;

  constructor(d: {
    repo: RegistrosRepository;
    chaves: ArmazenamentoDocumentos;
    padroes: PadroesService;
    ia?: ServicoIa;
    clock: Clock;
    limitar?: (chave: string, limite: number, janelaMs: number) => void;
    criarProcesso: (usuarioId: string, dados: Record<string, unknown>) => Promise<Processo>;
  }) {
    this.repo = d.repo;
    this.chaves = d.chaves;
    this.padroes = d.padroes;
    this.ia = d.ia;
    this.clock = d.clock;
    this.limitar = d.limitar ?? (() => undefined);
    this.criarProcesso = d.criarProcesso;
  }

  get triagemDisponivel() {
    return !!this.ia;
  }

  async listar(usuarioId: string): Promise<Pedido[]> {
    return (await this.repo.listar<ValorPedido>(usuarioId, "pedido")).map(paraPedido).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }

  private async exigir(usuarioId: string, id: string) {
    const r = idValido(id) ? await this.repo.obter<ValorPedido>(usuarioId, "pedido", id) : null;
    if (!r) throw naoEncontrado();
    return r;
  }

  /** Grava o pedido em nome de `usuarioId` (quem criou o link, quando vem de fora) e já faz a triagem. */
  async registrar(usuarioId: string, d: DadosNovoPedido, quem: string): Promise<Pedido> {
    const nome = textoLimpo(d.nome, LIMITES_PEDIDO.nome);
    const contato = textoLimpo(d.contato, LIMITES_PEDIDO.contato);
    const descricao = textoLimpo(d.descricao, LIMITES_PEDIDO.descricao);
    const assunto = textoLimpo(d.assunto, LIMITES_PEDIDO.assunto) ?? descricao?.slice(0, 80);
    if (!nome) throw new AppError("dados_invalidos", "Informe o nome.", { campo: "nome" });
    if (!contato) throw new AppError("dados_invalidos", "Informe um e-mail ou telefone para contato.", { campo: "contato" });
    if (!descricao || !assunto) throw new AppError("dados_invalidos", "Conte o que aconteceu.", { campo: "descricao" });
    if ((await this.repo.listar(usuarioId, "pedido")).length >= LIMITES_PEDIDO.porEscritorio) throw new AppError("indisponivel", "O escritório não está recebendo pedidos por aqui agora.");
    const agora = this.clock.agora().toISOString();
    const r: Registro<ValorPedido> = {
      id: novoId(),
      tipo: "pedido",
      valor: {
        origem: d.origem,
        nome,
        contato,
        assunto,
        descricao,
        status: "novo",
        ...(d.processoOrigemId ? { processoOrigemId: d.processoOrigemId } : {}),
        historico: [{ quando: agora, quem, acao: "Recebido" }],
      },
      criadoEm: agora,
      atualizadoEm: agora,
    };
    await this.repo.gravar(usuarioId, r);
    if (this.ia) {
      try {
        return await this.triar(usuarioId, r.id);
      } catch (e) {
        // O pedido já está salvo: a triagem pode ser refeita depois na tela.
        console.error("[pedidos] triagem falhou:", e instanceof Error ? e.message : e);
      }
    }
    return paraPedido(r);
  }

  async criarManual(autor: { id: string; nome: string }, corpo: unknown): Promise<Pedido> {
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    return this.registrar(autor.id, { origem: "manual", nome: c.nome, contato: c.contato, assunto: c.assunto, descricao: c.descricao }, nomeDoAutor(autor.nome));
  }

  async triar(usuarioId: string, id: string): Promise<Pedido> {
    const ia = this.ia;
    if (!ia) throw semIa("A triagem");
    const atual = await this.exigir(usuarioId, id);
    const padroes = await this.padroes.instrucoes(usuarioId, "pedidos");
    let triagem: TriagemPedido;
    try {
      // O pedido pode chegar pelo formulário público, sem sessão: o uso vai para o escritório dono do link.
      const { dados, modelo } = await comUsoIa(usuarioId, "pedidos", () =>
        perguntarJson<{ area: AreaAtuacao; urgencia: Urgencia; resumo: string; perguntas: string[]; alertaPrazo: string }>(ia, {
          sistema: INSTRUCOES_TRIAGEM,
          esquema: ESQUEMA_TRIAGEM,
          esforco: "low",
          simples: true,
          blocos: [
            { tipo: "documento", titulo: `Pedido: ${atual.valor.assunto}`, texto: atual.valor.descricao },
            { tipo: "texto", texto: `${padroes ? `${blocoDosPadroes(padroes)}\n\n` : ""}Faça a triagem.` },
          ],
        }),
      );
      const alerta = textoLimpo(dados.alertaPrazo, 400);
      triagem = {
        ...(dados.area in AREA_LABEL ? { area: dados.area } : {}),
        urgencia: (["baixa", "media", "alta"] as Urgencia[]).includes(dados.urgencia) ? dados.urgencia : "media",
        resumo: textoLimpo(dados.resumo, 1200) ?? "",
        perguntas: (Array.isArray(dados.perguntas) ? dados.perguntas : []).flatMap((p) => textoLimpo(p, 300) ?? []).slice(0, 6),
        ...(alerta ? { alertaPrazo: alerta } : {}),
        modelo,
        feitaEm: this.clock.agora().toISOString(),
      };
    } catch (e) {
      throw falhaDaIa("pedidos", e);
    }
    const salvo = await this.repo.alterar<ValorPedido>(usuarioId, "pedido", id, (r) => ({ ...r.valor, triagem }), this.clock.agora().toISOString());
    if (!salvo) throw naoEncontrado();
    return paraPedido(salvo);
  }

  async alterar(autor: { id: string; nome: string }, id: string, corpo: unknown): Promise<Pedido> {
    await this.exigir(autor.id, id);
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    const agora = this.clock.agora().toISOString();
    const quem = nomeDoAutor(autor.nome);
    const salvo = await this.repo.alterar<ValorPedido>(
      autor.id,
      "pedido",
      id,
      (r) => {
        const v = { ...r.valor };
        const acoes: string[] = [];
        if (STATUS.includes(c.status as StatusPedido) && c.status !== v.status && c.status !== "convertido") {
          v.status = c.status as StatusPedido;
          acoes.push(`Status: ${v.status}`);
        }
        if ("responsavelId" in c) {
          const novo = typeof c.responsavelId === "string" && c.responsavelId ? c.responsavelId.slice(0, 64) : undefined;
          if (novo !== v.responsavelId) {
            if (novo) v.responsavelId = novo;
            else delete v.responsavelId;
            acoes.push(novo ? "Responsável definido" : "Responsável removido");
          }
        }
        if (!acoes.length) return null;
        v.historico = [...v.historico, ...acoes.map((acao) => ({ quando: agora, quem, acao }))].slice(-50);
        return v;
      },
      agora,
    );
    return salvo ? paraPedido(salvo) : paraPedido(await this.exigir(autor.id, id));
  }

  /** Cria um caso em triagem com os dados do pedido e liga um ao outro. */
  async converter(autor: { id: string; nome: string }, id: string): Promise<{ pedido: Pedido; processo: Processo }> {
    const atual = await this.exigir(autor.id, id);
    if (atual.valor.processoId) throw new AppError("conflito", "Este pedido já virou caso.");
    const v = atual.valor;
    const processo = await this.criarProcesso(autor.id, {
      fase: "triagem",
      cliente: v.nome,
      polo: "ativo",
      dataAtendimento: this.clock.agora().toISOString().slice(0, 10),
      ...(v.triagem?.area ? { area: v.triagem.area } : {}),
      ...(v.responsavelId ? { responsavelId: v.responsavelId } : {}),
      observacoes: [`Pedido de ${v.nome} (${v.contato}) em ${atual.criadoEm.slice(0, 10)}: ${v.assunto}`, v.descricao, v.triagem?.resumo && `Triagem: ${v.triagem.resumo}`]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 5000),
    });
    const agora = this.clock.agora().toISOString();
    const salvo = await this.repo.alterar<ValorPedido>(
      autor.id,
      "pedido",
      id,
      (r) => ({ ...r.valor, status: "convertido", processoId: processo.id, historico: [...r.valor.historico, { quando: agora, quem: nomeDoAutor(autor.nome), acao: "Virou caso" }] }),
      agora,
    );
    if (!salvo) throw naoEncontrado();
    return { pedido: paraPedido(salvo), processo };
  }

  /** Rascunho da resposta ao interessado. Não envia nada. */
  async rascunhoResposta(usuarioId: string, id: string): Promise<{ texto: string }> {
    const ia = this.ia;
    if (!ia) throw semIa("O rascunho da resposta");
    const atual = await this.exigir(usuarioId, id);
    this.limitar(`pedidos-ia:${usuarioId}`, 60, DIA);
    const padroes = await this.padroes.instrucoes(usuarioId, "pedidos");
    try {
      const r = await ia.perguntar({
        sistema: INSTRUCOES_RESPOSTA,
        esforco: "low",
        simples: true,
        blocos: [
          { tipo: "documento", titulo: `Pedido de ${atual.valor.nome}: ${atual.valor.assunto}`, texto: atual.valor.descricao },
          {
            tipo: "texto",
            texto: [atual.valor.triagem?.perguntas.length && `Perguntas da triagem:\n${atual.valor.triagem.perguntas.map((p) => `- ${p}`).join("\n")}`, blocoDosPadroes(padroes), "Escreva a resposta."]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
      });
      return { texto: r.texto.trim() };
    } catch (e) {
      throw falhaDaIa("pedidos", e);
    }
  }

  async excluir(usuarioId: string, id: string) {
    await this.exigir(usuarioId, id);
    await this.repo.excluir(usuarioId, "pedido", id);
  }

  // ---- Formulário público ----

  async formulario(usuarioId: string): Promise<FormularioPedidos | null> {
    const [r] = await this.repo.listar<ValorFormulario & { hashToken?: string }>(usuarioId, "formulario_pedidos");
    if (!r) return null;
    const { hashToken: _h, ...valor } = r.valor;
    return { ...valor, id: r.id, criadoEm: r.criadoEm };
  }

  /** Cria (ou troca) o link público. O link antigo deixa de funcionar. Devolve o token uma vez só. */
  async gerarFormulario(autor: { id: string; nome: string }, corpo: unknown): Promise<{ formulario: FormularioPedidos; token: string }> {
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    const titulo = textoLimpo(c.titulo, 150) ?? "Fale com o escritório";
    const apresentacao = textoLimpo(c.apresentacao, 1000);
    for (const antigo of await this.repo.listar<ValorFormulario & { hashToken?: string }>(autor.id, "formulario_pedidos")) {
      if (antigo.valor.hashToken) await this.chaves.remover(`formulario-pedidos/${antigo.valor.hashToken}`);
      await this.repo.excluir(autor.id, "formulario_pedidos", antigo.id);
    }
    const token = tokenAleatorio(24);
    const agora = this.clock.agora().toISOString();
    const id = novoId();
    const valor = { ativo: true, titulo, ...(apresentacao ? { apresentacao } : {}), recebidos: 0, autorNome: nomeDoAutor(autor.nome), hashToken: sha256(token) };
    await this.repo.gravar(autor.id, { id, tipo: "formulario_pedidos", valor, criadoEm: agora, atualizadoEm: agora });
    await this.chaves.alterar<ChaveFormulario | null>(chaveToken(token), null, () => ({ valor: { usuarioId: autor.id, formularioId: id }, resultado: undefined }));
    const { hashToken: _h, ...publico } = valor;
    return { formulario: { ...publico, id, criadoEm: agora }, token };
  }

  async desligarFormulario(usuarioId: string) {
    for (const antigo of await this.repo.listar<ValorFormulario & { hashToken?: string }>(usuarioId, "formulario_pedidos")) {
      if (antigo.valor.hashToken) await this.chaves.remover(`formulario-pedidos/${antigo.valor.hashToken}`);
      await this.repo.excluir(usuarioId, "formulario_pedidos", antigo.id);
    }
  }

  private async porToken(token: unknown): Promise<{ usuarioId: string; formulario: Registro<ValorFormulario> }> {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new AppError("nao_encontrado", "Este link não existe ou foi desligado.");
    const achado = await this.chaves.ler<ChaveFormulario | null>(chaveToken(token), null);
    const formulario = achado ? await this.repo.obter<ValorFormulario>(achado.usuarioId, "formulario_pedidos", achado.formularioId).catch(() => null) : null;
    if (!achado || !formulario?.valor.ativo) throw new AppError("nao_encontrado", "Este link não existe ou foi desligado.");
    return { usuarioId: achado.usuarioId, formulario };
  }

  /** O que a página pública mostra (sem nada do escritório além do título e da apresentação). */
  async formularioPublico(token: unknown, nomeDoEscritorio: (usuarioId: string) => Promise<string>) {
    const { usuarioId, formulario } = await this.porToken(token);
    return { escritorio: await nomeDoEscritorio(usuarioId), titulo: formulario.valor.titulo, apresentacao: formulario.valor.apresentacao };
  }

  /** Envio pelo formulário público. Limita por IP e por formulário contra abuso. */
  async receberDoFormulario(token: unknown, corpo: unknown, ip: string): Promise<void> {
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    // Campo escondido: só robô preenche.
    if (typeof c.site === "string" && c.site) return;
    const { usuarioId, formulario } = await this.porToken(token);
    this.limitar(`pedido-ip:${ip}`, 5, HORA);
    this.limitar(`pedido-form:${formulario.id}`, 200, DIA);
    if (c.aceite !== true) throw new AppError("dados_invalidos", "Para enviar, autorize o escritório a usar estes dados para responder ao seu pedido.", { campo: "aceite" });
    await this.registrar(usuarioId, { origem: "formulario", nome: c.nome, contato: c.contato, assunto: c.assunto, descricao: c.descricao }, "Formulário público");
    await this.repo.alterar<ValorFormulario>(usuarioId, "formulario_pedidos", formulario.id, (r) => ({ ...r.valor, recebidos: r.valor.recebidos + 1 }), this.clock.agora().toISOString());
  }
}
