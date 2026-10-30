import { test } from "node:test";
import assert from "node:assert/strict";
import { contarPendencias, extrairCitacoes } from "../lib/citacoes.ts";
import { aplicarSugestao } from "../lib/editor.ts";
import { gerarDocx, pareceTitulo } from "../lib/exportacao/docx.ts";
import { cronologiaEmTexto, montarLinhaDoTempo } from "../lib/linha-do-tempo.ts";
import { instrucoesDosPadroes, normalizarPadrao, validarPadrao } from "../lib/padroes.ts";
import { linkAtivo, mesmoCliente } from "../lib/portal.ts";
import { revisaoEmCsv } from "../lib/revisao.ts";
import { novoId } from "../server/core/crypto.ts";
import { AppError } from "../server/core/errors.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { ArquivosEmMemoria } from "../server/infra/arquivos.ts";
import { CitacoesService, hashDoTexto } from "../server/ia/citacoes.ts";
import { ContextoProcesso } from "../server/ia/contexto-processo.ts";
import { filtrarSugestoes } from "../server/ia/editor.ts";
import type { PedidoIa, RespostaIa, ServicoIa } from "../server/ia/ia.ts";
import { LinhaDoTempoService, normalizarFatos } from "../server/ia/linha-do-tempo.ts";
import { PadroesService } from "../server/ia/padroes.ts";
import { PedidosService } from "../server/ia/pedidos.ts";
import { PortalService } from "../server/ia/portal.ts";
import { ProvidenciasService } from "../server/ia/providencias.ts";
import { RevisoesService } from "../server/ia/revisoes.ts";
import { BibliotecaRepositoryDocumentos, BibliotecaService } from "../server/biblioteca/biblioteca.ts";
import { DocumentoRepositoryDocumentos, DocumentosService } from "../server/processos/documentos.ts";
import { MovimentacaoRepositoryDocumentos, MovimentacoesService } from "../server/processos/movimentacoes.ts";
import { ProcessoRepositoryDocumentos } from "../server/processos/processos.ts";
import { RegistrosRepositoryDocumentos } from "../server/registros/registros.ts";
import type { Processo } from "../lib/processos.ts";

const relogio = { agora: () => new Date("2026-10-30T12:00:00Z") };
const pdf = (texto: string) => new TextEncoder().encode(`%PDF-1.7\n${texto}\n%%EOF`);
const erro = (codigo: string) => (e: unknown) => e instanceof AppError && e.codigo === codigo;

/** IA de mentira: devolve a próxima resposta da fila e guarda os pedidos. */
class IaFalsa implements ServicoIa {
  readonly modelo = "falso";
  pedidos: PedidoIa[] = [];
  private readonly respostas: (string | object)[];
  constructor(respostas: (string | object)[]) {
    this.respostas = respostas;
  }
  async perguntar(p: PedidoIa): Promise<RespostaIa> {
    this.pedidos.push(p);
    const r = this.respostas.shift() ?? "{}";
    return { texto: typeof r === "string" ? r : JSON.stringify(r), fontesWeb: [], modelo: this.modelo };
  }
}

function montar(ia?: ServicoIa) {
  const banco = new ArmazenamentoEmMemoria();
  const arquivos = new ArquivosEmMemoria();
  const processos = new ProcessoRepositoryDocumentos(banco);
  const documentos = new DocumentosService({ repo: new DocumentoRepositoryDocumentos(banco), processos, arquivos, clock: relogio });
  const repo = new RegistrosRepositoryDocumentos(banco);
  const padroes = new PadroesService({ repo, clock: relogio });
  const contexto = new ContextoProcesso({ processos, documentos });
  const biblioteca = new BibliotecaService({ repo: new BibliotecaRepositoryDocumentos(banco), arquivos, clock: relogio });
  return { banco, processos, documentos, repo, padroes, contexto, biblioteca };
}

async function processo(processos: ProcessoRepositoryDocumentos, usuarioId: string, extra: Partial<Processo> = {}): Promise<Processo> {
  const agora = relogio.agora().toISOString();
  const p: Processo = { id: novoId(), cliente: "Maria Souza", polo: "ativo", fase: "triagem", area: "consumidor", criadoEm: agora, atualizadoEm: agora, ...extra };
  await processos.criar(usuarioId, p);
  return p;
}

// ---- Funções puras ----

test("citações: acha súmula, tema, precedente e artigo, e marca [conferir]", () => {
  const texto = "Aplica-se a Súmula 385/STJ e o Tema 1.061 do STJ. Ver REsp 1.234.567/SP [conferir]. Nos termos do art. 14 do CDC e da Lei 13.709/2018. Súmula nº 385 do STJ de novo.";
  const c = extrairCitacoes(texto);
  const tipos = c.map((x) => x.tipo).sort();
  assert.ok(tipos.includes("sumula") && tipos.includes("tema") && tipos.includes("precedente") && tipos.includes("lei"));
  const sumula = c.find((x) => x.tipo === "sumula")!;
  assert.equal(sumula.ocorrencias, 2, "mesma súmula escrita de dois jeitos conta uma vez só");
  assert.equal(c.find((x) => x.tipo === "precedente")!.marcadaConferir, true);
  assert.equal(contarPendencias({ citacoes: [{ ...sumula, situacao: "nao_encontrada" }, { ...sumula, situacao: "confirmada" }] }), 1);
});

test("editor: só aceita trocas cujo trecho existe uma vez e muda algo", () => {
  const texto = "O autor alega dano. O autor pede indenização.";
  const s = filtrarSugestoes(texto, [
    { original: "O autor", novo: "A autora", motivo: "ambíguo" },
    { original: "alega dano", novo: "alega dano moral", motivo: "precisão" },
    { original: "pede indenização", novo: "pede indenização", motivo: "igual" },
    { original: "não existe", novo: "x", motivo: "fora" },
  ]);
  assert.deepEqual(
    s.map((x) => x.original),
    ["alega dano"],
  );
  assert.equal(aplicarSugestao(texto, s[0]), "O autor alega dano moral. O autor pede indenização.");
  assert.equal(aplicarSugestao("outro texto", s[0]), null);
});

test("Word: gera um .docx (zip) com o texto e reconhece títulos", () => {
  const bytes = gerarDocx({ escritorio: "Lionço Advogados", titulo: "Parecer", texto: "Síntese do caso\n\nO cliente comprou & pagou <tudo>." });
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), "PK");
  const conteudo = new TextDecoder("latin1").decode(bytes);
  assert.ok(conteudo.includes("word/document.xml"));
  assert.equal(pareceTitulo("Síntese do caso"), true);
  assert.equal(pareceTitulo("O cliente comprou o produto e não recebeu."), false);
});

test("padrões: valida, normaliza e junta só os ligados para o uso pedido", () => {
  assert.ok(validarPadrao({ nome: "", instrucoes: "", usos: [], escopo: "escritorio", ativo: true }).nome);
  const p = normalizarPadrao({ nome: "  Parecer ", instrucoes: " Seja direto. ", usos: ["parecer", "lixo"], escopo: "pessoal", ativo: true });
  assert.deepEqual(p.usos, ["parecer"]);
  const base = { id: "1", autorId: "a", autorNome: "Ana", criadoEm: "", atualizadoEm: "" };
  const texto = instrucoesDosPadroes(
    [
      { ...base, ...p },
      { ...base, id: "2", nome: "Desligado", instrucoes: "Não use", usos: ["parecer"], escopo: "escritorio", ativo: false },
      { ...base, id: "3", nome: "Risco", instrucoes: "Só risco", usos: ["risco"], escopo: "escritorio", ativo: true },
    ],
    "parecer",
  );
  assert.ok(texto.includes("Seja direto."));
  assert.ok(!texto.includes("Não use") && !texto.includes("Só risco"));
});

test("linha do tempo: junta andamentos, intimações, fatos e notas em ordem, com a origem", () => {
  const eventos = montarLinhaDoTempo({
    movimentacoes: { numero: "1", consultadoEm: "2026-10-01T00:00:00Z", encontrado: true, movimentos: [{ dataHora: "2026-09-10T10:00:00Z", nome: "Citação", codigo: 1 }] },
    intimacoes: [{ id: "i1", dataDisponibilizacao: "2026-09-20", tipoComunicacao: "Intimação", prazo: "2026-10-05" }],
    fatos: { fatos: [{ id: "f1", data: "2025-01-15", descricao: "Compra do produto", fonte: { documentoId: "d", documentoNome: "Inicial.pdf", pagina: 3 } }], documentos: [], modelo: "x", autorNome: "Ana", criadoEm: "" },
    notas: [{ id: "n1", tipo: "email", data: "2026-09-25", titulo: "Cliente mandou comprovante", texto: "...", visivelAoCliente: false, autorNome: "Ana", criadoEm: "" }],
  } as never);
  const datas = eventos.map((e) => e.quando);
  assert.deepEqual([...datas].sort().reverse(), datas, "do mais novo para o mais antigo");
  assert.deepEqual(new Set(eventos.map((e) => e.origem)), new Set(["andamento", "intimacao", "fato", "nota"]));
  assert.ok(cronologiaEmTexto(eventos).includes("Compra do produto"));
  assert.deepEqual(normalizarFatos([{ data: "2025-13-40", descricao: "data ruim", documento: 1, pagina: 1 }], [{ id: "d", nome: "a.pdf" }]), []);
});

test("portal: mesmo cliente ignora acento e caixa; link vence e é revogado", () => {
  assert.equal(mesmoCliente("José da Silva", "  jose DA  silva "), true);
  const agora = new Date("2026-10-30T00:00:00Z");
  assert.equal(linkAtivo({ expiraEm: "2026-11-01T00:00:00Z" }, agora), true);
  assert.equal(linkAtivo({ expiraEm: "2026-10-01T00:00:00Z" }, agora), false);
  assert.equal(linkAtivo({ expiraEm: "2026-11-01T00:00:00Z", revogadoEm: "2026-10-29T00:00:00Z" }, agora), false);
});

test("revisão: planilha com ; e aspas, uma coluna de fonte por pergunta", () => {
  const csv = revisaoEmCsv({
    perguntas: [{ id: "q", texto: "Valor", formato: "valor" }],
    linhas: [{ processoId: "p", rotulo: 'Maria "M"', celulas: { q: { resposta: "R$ 10.000", estado: "pronta", fonte: { documentoId: "d", documentoNome: "Inicial.pdf", pagina: 2 } } } }],
  });
  assert.equal(csv, '"Processo";"Valor";"Valor (fonte)"\r\n"Maria ""M""";"R$ 10.000";"Inicial.pdf, p. 2"\r\n');
});

// ---- Serviços ----

test("padrões pessoais só valem para quem criou; os do escritório para todos", async () => {
  const { padroes } = montar();
  const ana = { id: novoId(), nome: "Ana" };
  await padroes.criar(ana, { nome: "Meu jeito", instrucoes: "Frases curtas.", usos: ["parecer"], escopo: "pessoal", ativo: true });
  assert.ok((await padroes.instrucoes(ana.id, "parecer")).includes("Frases curtas."));
  assert.equal(await padroes.instrucoes(ana.id, "risco"), "");
  await assert.rejects(padroes.criar(ana, { nome: "", instrucoes: "", usos: [] }), erro("dados_invalidos"));
});

test("providências: a IA só sugere com página do PDF; confirmar e concluir ficam no histórico", async () => {
  const ia = new IaFalsa([
    {
      providencias: [
        { descricao: "Juntar comprovante de pagamento", fundamento: "art. 373 do CPC", prazo: "2026-11-10", documento: 1, pagina: 4 },
        { descricao: "Sem fonte", documento: 9, pagina: 1 },
      ],
    },
  ]);
  const { processos, documentos, repo, padroes, contexto } = montar();
  const servico = new ProvidenciasService({ repo, contexto, padroes, ia, clock: relogio });
  const ana = { id: novoId(), nome: "Ana" };
  const p = await processo(processos, ana.id);
  await assert.rejects(servico.extrair(ana, p.id), erro("dados_invalidos"), "sem PDF não há o que ler");
  await documentos.enviar(ana.id, p.id, { nome: "Inicial.pdf", bytes: pdf("inicial") });
  const r = await servico.extrair(ana, p.id);
  assert.equal(r.novas, 1);
  const item = r.itens[0];
  assert.equal(item.sugerida, true);
  assert.equal(item.fonte?.pagina, 4);
  assert.deepEqual(await servico.pendentes(ana.id), [], "sugestão não confirmada não vai para o Hoje");
  await servico.alterar(ana, p.id, item.id, {});
  await servico.alterar(ana, p.id, item.id, { situacao: "feita" });
  const final = (await servico.obter(ana.id, p.id)).itens[0];
  assert.equal(final.situacao, "feita");
  assert.equal(final.sugerida, false);
  assert.ok(final.historico.length >= 3);
});

test("linha do tempo: nota de e-mail colado ganha resumo da IA e pode ir ao portal", async () => {
  const ia = new IaFalsa([{ resumo: "Cliente enviou o comprovante.", acoes: ["Juntar aos autos"] }]);
  const { processos, repo, padroes, contexto } = montar();
  const servico = new LinhaDoTempoService({ repo, contexto, padroes, ia, clock: relogio });
  const ana = { id: novoId(), nome: "Ana" };
  const p = await processo(processos, ana.id);
  const n = await servico.criarNota(ana, p.id, { tipo: "email", titulo: "E-mail da Maria", texto: "Segue o comprovante em anexo.", data: "2026-10-29", resumir: true });
  assert.equal(n.resumo, "Cliente enviou o comprovante.");
  assert.equal(n.visivelAoCliente, false);
  assert.equal((await servico.alterarNota(ana.id, p.id, n.id, { visivelAoCliente: true })).visivelAoCliente, true);
  await assert.rejects(servico.criarNota(ana, novoId(), { tipo: "email", titulo: "x", texto: "y", data: "2026-10-29" }), erro("nao_encontrado"));
});

test("citações: confere na biblioteca sem IA e guarda a última verificação do processo", async () => {
  const { processos, repo, padroes, contexto, biblioteca } = montar();
  const servico = new CitacoesService({ repo, biblioteca, contexto, padroes, clock: relogio });
  const ana = { id: novoId(), nome: "Ana" };
  const p = await processo(processos, ana.id);
  await biblioteca.criar(ana, { tipo: "sumula", titulo: "Anotação irregular", referencia: "Súmula 385/STJ", texto: "Da anotação irregular…" });
  const texto = "Incide a Súmula 385 do STJ. Também o Tema 1.061/STJ.";
  const v = await servico.verificar(ana, { texto, processoId: p.id });
  assert.equal(v.pesquisaOficial, false);
  assert.equal(v.hashTexto, hashDoTexto(texto));
  assert.equal(v.citacoes.find((c) => c.tipo === "sumula")?.situacao, "na_biblioteca");
  assert.equal(v.citacoes.find((c) => c.tipo === "tema")?.situacao, "nao_verificada");
  assert.equal((await servico.ultima(ana.id, p.id))?.id, v.id);
});

test("revisão: só processos existentes viram linhas; célula editada à mão fica com autor e trava; sem IA não preenche", async () => {
  const { processos, repo, padroes, contexto } = montar();
  const servico = new RevisoesService({ repo, processos, contexto, padroes, clock: relogio });
  const ana = { id: novoId(), nome: "Ana" };
  const p1 = await processo(processos, ana.id);
  const p2 = await processo(processos, ana.id, { cliente: "João" });
  const r = await servico.criar(ana, { titulo: "Carteira", perguntas: [{ texto: "Valor?", formato: "valor" }], processos: [p1.id, p2.id, novoId()] });
  assert.equal(r.linhas.length, 2);
  await assert.rejects(servico.criar(ana, { perguntas: [], processos: [p1.id] }), erro("dados_invalidos"));
  const celula = await servico.alterarCelula(ana, r.id, p1.id, r.perguntas[0].id, { resposta: "R$ 5.000", revisada: true, travada: true });
  assert.equal(celula.editadaPor, "Ana");
  assert.equal(celula.travada, true);
  await assert.rejects(servico.executar(ana, r.id, p1.id), erro("indisponivel"));
});

function montarExterno(ia?: ServicoIa) {
  const base = montar();
  const { banco, processos, documentos, repo, padroes, contexto } = base;
  const criados: Record<string, unknown>[] = [];
  const pedidos = new PedidosService({
    repo,
    chaves: banco,
    padroes,
    ia,
    clock: relogio,
    criarProcesso: async (usuarioId, dados) => {
      criados.push(dados);
      return processo(processos, usuarioId, { cliente: String(dados.cliente) });
    },
  });
  const linhaDoTempo = new LinhaDoTempoService({ repo, contexto, padroes, clock: relogio });
  const movimentacoes = new MovimentacoesService({ repo: new MovimentacaoRepositoryDocumentos(banco), processos, consultar: async () => null, clock: relogio, listarUsuarios: async () => [] } as never);
  const portal = new PortalService({ repo, chaves: banco, processos, documentos, movimentacoes, linhaDoTempo, pedidos, nomeDoEscritorio: async () => "Lionço Advogados", clock: relogio });
  return { ...base, pedidos, portal, linhaDoTempo, criados };
}

test("formulário público: honeypot descarta, aceite é obrigatório e o token antigo morre ao gerar outro", async () => {
  const { pedidos } = montarExterno();
  const ana = { id: novoId(), nome: "Ana" };
  const { token } = await pedidos.gerarFormulario(ana, { titulo: "Fale conosco" });
  assert.equal((await pedidos.formulario(ana.id)) && "hashToken" in (await pedidos.formulario(ana.id))!, false, "o hash do token não sai do servidor");
  const envio = { nome: "Carlos", contato: "carlos@x.com", assunto: "Banco", descricao: "Cobraram duas vezes." };
  await pedidos.receberDoFormulario(token, { ...envio, aceite: true, site: "http://spam" }, "1.1.1.1");
  assert.equal((await pedidos.listar(ana.id)).length, 0, "robô cai na isca");
  await assert.rejects(pedidos.receberDoFormulario(token, envio, "1.1.1.1"), erro("dados_invalidos"));
  await pedidos.receberDoFormulario(token, { ...envio, aceite: true }, "1.1.1.1");
  const [p] = await pedidos.listar(ana.id);
  assert.equal(p.origem, "formulario");
  assert.equal(p.status, "novo");
  assert.equal((await pedidos.formularioPublico(token, async () => "Lionço")).titulo, "Fale conosco");
  const novo = await pedidos.gerarFormulario(ana, {});
  await assert.rejects(pedidos.formularioPublico(token, async () => "x"), erro("nao_encontrado"));
  await pedidos.formularioPublico(novo.token, async () => "x");
});

test("pedido vira caso uma vez só", async () => {
  const { pedidos, criados } = montarExterno();
  const ana = { id: novoId(), nome: "Ana" };
  const p = await pedidos.criarManual(ana, { nome: "Carlos", contato: "11 9999-0000", assunto: "Aluguel", descricao: "Despejo." });
  const r = await pedidos.converter(ana, p.id);
  assert.equal(r.pedido.status, "convertido");
  assert.equal(r.pedido.processoId, r.processo.id);
  assert.equal(criados.length, 1);
  await assert.rejects(pedidos.converter(ana, p.id), erro("conflito"));
});

test("portal: mostra só o cliente certo, sem particulares, e mensagens viram pedidos", async () => {
  const { processos, portal, pedidos, linhaDoTempo } = montarExterno();
  const ana = { id: novoId(), nome: "Ana" };
  const visivel = await processo(processos, ana.id, { cliente: "Maria Souza", numero: "00012345620268260100" });
  await processo(processos, ana.id, { cliente: "Maria Souza", particular: true });
  await processo(processos, ana.id, { cliente: "Outro Cliente" });
  const nota = await linhaDoTempo.criarNota(ana, visivel.id, { tipo: "anotacao", titulo: "Audiência marcada", texto: "Dia 10/11 às 14h.", data: "2026-10-29" });
  await linhaDoTempo.alterarNota(ana.id, visivel.id, nota.id, { visivelAoCliente: true });
  await linhaDoTempo.criarNota(ana, visivel.id, { tipo: "anotacao", titulo: "Estratégia interna", texto: "Não mostrar.", data: "2026-10-29" });

  await assert.rejects(portal.criar(ana, { cliente: "Ninguém" }), erro("dados_invalidos"));
  const { link, token } = await portal.criar(ana, { cliente: "maria souza", permitirMensagens: true });
  assert.ok(!("hashToken" in link));
  const v = await portal.visao(token, "1.1.1.1");
  assert.equal(v.escritorio, "Lionço Advogados");
  assert.deepEqual(
    v.processos.map((p) => p.id),
    [visivel.id],
  );
  assert.deepEqual(
    v.processos[0].notas.map((n) => n.titulo),
    ["Audiência marcada"],
  );
  await portal.mensagem(token, "1.1.1.1", { assunto: "Dúvida", mensagem: "Preciso ir à audiência?", processoId: visivel.id });
  const [pedido] = await pedidos.listar(ana.id);
  assert.equal(pedido.origem, "portal");
  assert.equal(pedido.processoOrigemId, visivel.id);

  await portal.revogar(ana.id, link.id);
  await assert.rejects(portal.visao(token, "1.1.1.1"), erro("nao_encontrado"));
  await assert.rejects(portal.visao("curto", "1.1.1.1"), erro("nao_encontrado"));
});
