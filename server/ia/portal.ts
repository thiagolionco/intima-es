import { LIMITES_PORTAL, linkAtivo, type LinkPortal, mesmoCliente, type ProcessoNoPortal, type VisaoPortal } from "../../lib/portal.ts";
import { type DocumentoProcesso, type Processo, referencia } from "../../lib/processos.ts";
import { formatProcesso } from "../../lib/utils.ts";
import { DIA, HORA, type Clock } from "../core/clock.ts";
import { novoId, sha256, tokenAleatorio } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import type { ArmazenamentoDocumentos } from "../infra/armazenamento.ts";
import type { DocumentosService } from "../processos/documentos.ts";
import type { MovimentacoesService } from "../processos/movimentacoes.ts";
import type { ProcessoRepository } from "../processos/processos.ts";
import { idValido, nomeDoAutor, type Registro, type RegistrosRepository, textoLimpo } from "../registros/registros.ts";
import type { LinhaDoTempoService } from "./linha-do-tempo.ts";
import type { PedidosService } from "./pedidos.ts";

type ValorLink = Omit<LinkPortal, "id" | "criadoEm"> & { hashToken: string };

interface ChaveLink {
  usuarioId: string;
  linkId: string;
}

const chaveToken = (hash: string) => `portal/${hash}`;
const inexistente = () => new AppError("nao_encontrado", "Este link não existe, expirou ou foi desligado pelo escritório.");
const paraLink = (r: Registro<ValorLink>): LinkPortal => {
  const { hashToken: _h, ...v } = r.valor;
  return { ...v, id: r.id, criadoEm: r.criadoEm };
};

/**
 * Portal do cliente: link secreto, sem conta, só leitura. O token só existe no link; aqui fica o
 * hash. Quem abre vê só o que o escritório escolheu, sempre pelos olhos de quem criou o link.
 */
export class PortalService {
  private readonly repo: RegistrosRepository;
  private readonly chaves: ArmazenamentoDocumentos;
  private readonly processos: ProcessoRepository;
  private readonly documentos: DocumentosService;
  private readonly movimentacoes: MovimentacoesService;
  private readonly linhaDoTempo: LinhaDoTempoService;
  private readonly pedidos: PedidosService;
  private readonly nomeDoEscritorio: (usuarioId: string) => Promise<string>;
  private readonly clock: Clock;
  private readonly limitar: (chave: string, limite: number, janelaMs: number) => void;

  constructor(d: {
    repo: RegistrosRepository;
    chaves: ArmazenamentoDocumentos;
    processos: ProcessoRepository;
    documentos: DocumentosService;
    movimentacoes: MovimentacoesService;
    linhaDoTempo: LinhaDoTempoService;
    pedidos: PedidosService;
    nomeDoEscritorio: (usuarioId: string) => Promise<string>;
    clock: Clock;
    limitar?: (chave: string, limite: number, janelaMs: number) => void;
  }) {
    this.repo = d.repo;
    this.chaves = d.chaves;
    this.processos = d.processos;
    this.documentos = d.documentos;
    this.movimentacoes = d.movimentacoes;
    this.linhaDoTempo = d.linhaDoTempo;
    this.pedidos = d.pedidos;
    this.nomeDoEscritorio = d.nomeDoEscritorio;
    this.clock = d.clock;
    this.limitar = d.limitar ?? (() => undefined);
  }

  async listar(usuarioId: string): Promise<LinkPortal[]> {
    return (await this.repo.listar<ValorLink>(usuarioId, "portal")).map(paraLink).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }

  private async lerCorpo(usuarioId: string, corpo: unknown) {
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    const cliente = textoLimpo(c.cliente, 200);
    if (!cliente) throw new AppError("dados_invalidos", "Escolha o cliente.", { campo: "cliente" });
    const doCliente = (await this.processos.listar(usuarioId)).filter((p) => mesmoCliente(p.cliente, cliente) && !p.particular);
    if (!doCliente.length) throw new AppError("dados_invalidos", "Este cliente não tem processos do escritório para mostrar.", { campo: "cliente" });
    const pedidos = Array.isArray(c.processoIds) ? c.processoIds.filter(idValido) : [];
    const processoIds = pedidos.filter((id) => doCliente.some((p) => p.id === id));
    if (pedidos.length && !processoIds.length) throw new AppError("dados_invalidos", "Os processos escolhidos não são deste cliente.", { campo: "processoIds" });
    const alvos = processoIds.length ? doCliente.filter((p) => processoIds.includes(p.id)) : doCliente;
    // Só PDFs que existem nos processos mostrados.
    const docsPermitidos = new Set<string>();
    for (const p of alvos) for (const d of await this.documentos.listar(usuarioId, p.id)) docsPermitidos.add(d.id);
    const documentoIds = (Array.isArray(c.documentoIds) ? c.documentoIds.filter(idValido) : []).filter((id) => docsPermitidos.has(id));
    const dias = Math.min(LIMITES_PORTAL.diasMaximo, Math.max(1, Number.isInteger(c.dias) ? (c.dias as number) : LIMITES_PORTAL.diasPadrao));
    const mensagem = textoLimpo(c.mensagem, LIMITES_PORTAL.mensagem);
    return {
      cliente: doCliente[0].cliente,
      processoIds,
      titulo: textoLimpo(c.titulo, LIMITES_PORTAL.titulo) ?? `Acompanhamento de ${doCliente[0].cliente}`,
      ...(mensagem ? { mensagem } : {}),
      documentoIds,
      mostrarAndamentos: c.mostrarAndamentos !== false,
      permitirMensagens: c.permitirMensagens === true,
      dias,
    };
  }

  /** Cria o link. O token volta só agora: depois, nem o escritório consegue ver de novo. */
  async criar(autor: { id: string; nome: string }, corpo: unknown): Promise<{ link: LinkPortal; token: string }> {
    const { dias, ...dados } = await this.lerCorpo(autor.id, corpo);
    if ((await this.repo.listar(autor.id, "portal")).length >= LIMITES_PORTAL.porEscritorio) throw new AppError("dados_invalidos", "Limite de links do portal. Exclua os antigos.");
    const token = tokenAleatorio(32);
    const hashToken = sha256(token);
    const agora = this.clock.agora();
    const r: Registro<ValorLink> = {
      id: novoId(),
      tipo: "portal",
      valor: { ...dados, expiraEm: new Date(agora.getTime() + dias * DIA).toISOString(), acessos: 0, autorId: autor.id, autorNome: nomeDoAutor(autor.nome), hashToken },
      criadoEm: agora.toISOString(),
      atualizadoEm: agora.toISOString(),
    };
    await this.repo.gravar(autor.id, r);
    await this.chaves.alterar<ChaveLink | null>(chaveToken(hashToken), null, () => ({ valor: { usuarioId: autor.id, linkId: r.id }, resultado: undefined }));
    return { link: paraLink(r), token };
  }

  /** Muda o que o link mostra (o endereço continua o mesmo). */
  async atualizar(usuarioId: string, id: string, corpo: unknown): Promise<LinkPortal> {
    const atual = idValido(id) ? await this.repo.obter<ValorLink>(usuarioId, "portal", id) : null;
    if (!atual) throw new AppError("nao_encontrado", "Link não encontrado.");
    const { dias, ...dados } = await this.lerCorpo(usuarioId, { ...atual.valor, ...(corpo as object) });
    const prorrogar = (corpo as { dias?: unknown } | null)?.dias !== undefined;
    const salvo = await this.repo.alterar<ValorLink>(
      usuarioId,
      "portal",
      id,
      (r) => ({ ...r.valor, ...dados, ...(prorrogar ? { expiraEm: new Date(this.clock.agora().getTime() + dias * DIA).toISOString() } : {}) }),
      this.clock.agora().toISOString(),
    );
    if (!salvo) throw new AppError("nao_encontrado", "Link não encontrado.");
    return paraLink(salvo);
  }

  /** Desliga na hora: quem tiver o link deixa de ver. */
  async revogar(usuarioId: string, id: string): Promise<LinkPortal> {
    const atual = idValido(id) ? await this.repo.obter<ValorLink>(usuarioId, "portal", id) : null;
    if (!atual) throw new AppError("nao_encontrado", "Link não encontrado.");
    await this.chaves.remover(chaveToken(atual.valor.hashToken));
    const agora = this.clock.agora().toISOString();
    const salvo = await this.repo.alterar<ValorLink>(usuarioId, "portal", id, (r) => ({ ...r.valor, revogadoEm: r.valor.revogadoEm ?? agora }), agora);
    return paraLink(salvo ?? atual);
  }

  async excluir(usuarioId: string, id: string) {
    const atual = idValido(id) ? await this.repo.obter<ValorLink>(usuarioId, "portal", id) : null;
    if (!atual) throw new AppError("nao_encontrado", "Link não encontrado.");
    await this.chaves.remover(chaveToken(atual.valor.hashToken));
    await this.repo.excluir(usuarioId, "portal", id);
  }

  // ---- Acesso do cliente (sem login) ----

  private async porToken(token: unknown, ip: string): Promise<{ usuarioId: string; link: Registro<ValorLink>; processos: Processo[] }> {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{30,64}$/.test(token)) throw inexistente();
    this.limitar(`portal-ip:${ip}`, 120, HORA);
    const achado = await this.chaves.ler<ChaveLink | null>(chaveToken(sha256(token)), null);
    if (!achado) throw inexistente();
    const link = await this.repo.obter<ValorLink>(achado.usuarioId, "portal", achado.linkId).catch(() => null);
    if (!link || !linkAtivo(link.valor, this.clock.agora())) throw inexistente();
    const v = link.valor;
    const processos = (await this.processos.listar(achado.usuarioId)).filter(
      (p) => !p.particular && mesmoCliente(p.cliente, v.cliente) && (!v.processoIds.length || v.processoIds.includes(p.id)),
    );
    return { usuarioId: achado.usuarioId, link, processos };
  }

  async visao(token: unknown, ip: string): Promise<VisaoPortal> {
    const { usuarioId, link, processos } = await this.porToken(token, ip);
    const v = link.valor;
    const lista: ProcessoNoPortal[] = [];
    for (const p of processos.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm))) {
      const mov = v.mostrarAndamentos ? await this.movimentacoes.obter(usuarioId, p.id).catch(() => null) : null;
      const notas = (await this.linhaDoTempo.notas(usuarioId, p.id).catch(() => [])).filter((n) => n.visivelAoCliente);
      const docs: DocumentoProcesso[] = v.documentoIds.length ? await this.documentos.listar(usuarioId, p.id).catch(() => []) : [];
      lista.push({
        id: p.id,
        rotulo: referencia(p),
        ...(p.numero ? { numero: formatProcesso(p.numero) } : {}),
        fase: p.fase,
        ...(p.tribunal ? { tribunal: p.tribunal } : {}),
        ...(p.orgao ? { orgao: p.orgao } : {}),
        ...(p.classe ? { classe: p.classe } : {}),
        andamentos: (mov?.movimentos ?? []).slice(0, 15).map((m) => ({ dataHora: m.dataHora, nome: m.nome })),
        notas: notas.slice(0, 20).map((n) => ({ data: n.data, titulo: n.titulo, texto: n.resumo ?? n.texto })),
        documentos: docs.filter((d) => v.documentoIds.includes(d.id)).map((d) => ({ id: d.id, nome: d.nome, tamanho: d.tamanho })),
      });
    }
    const agora = this.clock.agora().toISOString();
    await this.repo.alterar<ValorLink>(usuarioId, "portal", link.id, (r) => ({ ...r.valor, acessos: r.valor.acessos + 1, ultimoAcesso: agora }), agora).catch(() => null);
    return {
      escritorio: await this.nomeDoEscritorio(usuarioId),
      titulo: v.titulo,
      ...(v.mensagem ? { mensagem: v.mensagem } : {}),
      cliente: v.cliente,
      processos: lista,
      permitirMensagens: v.permitirMensagens,
      expiraEm: v.expiraEm,
      geradoEm: agora,
    };
  }

  async documento(token: unknown, ip: string, processoId: string, documentoId: string): Promise<{ documento: DocumentoProcesso; bytes: Uint8Array }> {
    const { usuarioId, link, processos } = await this.porToken(token, ip);
    if (!link.valor.documentoIds.includes(documentoId) || !processos.some((p) => p.id === processoId)) throw new AppError("nao_encontrado", "Documento não encontrado.");
    return this.documentos.abrir(usuarioId, processoId, documentoId);
  }

  /** Mensagem do cliente pelo portal: vira um pedido para o escritório. */
  async mensagem(token: unknown, ip: string, corpo: unknown): Promise<void> {
    const { usuarioId, link, processos } = await this.porToken(token, ip);
    if (!link.valor.permitirMensagens) throw new AppError("sem_permissao", "O escritório não recebe mensagens por este link.");
    this.limitar(`portal-msg:${link.id}`, 20, DIA);
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    const processoOrigemId = idValido(c.processoId) && processos.some((p) => p.id === c.processoId) ? c.processoId : undefined;
    await this.pedidos.registrar(
      usuarioId,
      { origem: "portal", nome: link.valor.cliente, contato: c.contato || "Pelo portal do cliente", assunto: c.assunto, descricao: c.mensagem, ...(processoOrigemId ? { processoOrigemId } : {}) },
      "Portal do cliente",
    );
  }
}
