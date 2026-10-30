import { test } from "node:test";
import assert from "node:assert/strict";
import { MODELOS_FLUXO, passoAtual, ultimoTexto, validarFluxo } from "../lib/fluxos-ia.ts";
import type { Processo } from "../lib/processos.ts";
import { BibliotecaRepositoryDocumentos, BibliotecaService } from "../server/biblioteca/biblioteca.ts";
import { novoId } from "../server/core/crypto.ts";
import { AppError } from "../server/core/errors.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { ArquivosEmMemoria } from "../server/infra/arquivos.ts";
import { CitacoesService } from "../server/ia/citacoes.ts";
import { ContextoProcesso } from "../server/ia/contexto-processo.ts";
import { FluxosIaService, relatorioDe } from "../server/ia/fluxos.ts";
import type { PedidoIa, RespostaIa, ServicoIa } from "../server/ia/ia.ts";
import { PadroesService } from "../server/ia/padroes.ts";
import { PesquisaService } from "../server/ia/pesquisa.ts";
import { RevisoesService } from "../server/ia/revisoes.ts";
import { DocumentoRepositoryDocumentos, DocumentosService } from "../server/processos/documentos.ts";
import { ProcessoRepositoryDocumentos } from "../server/processos/processos.ts";
import { RegistrosRepositoryDocumentos } from "../server/registros/registros.ts";

const relogio = { agora: () => new Date("2026-10-30T12:00:00Z") };
const pdf = (texto: string) => new TextEncoder().encode(`%PDF-1.7\n${texto}\n%%EOF`);
const erro = (codigo: string) => (e: unknown) => e instanceof AppError && e.codigo === codigo;

/** IA de mentira: responde pela função dada e guarda os pedidos. */
class IaFalsa implements ServicoIa {
  readonly modelo = "falso";
  pedidos: PedidoIa[] = [];
  private readonly responder: (p: PedidoIa) => string | object;
  constructor(responder: (p: PedidoIa) => string | object) {
    this.responder = responder;
  }
  async perguntar(p: PedidoIa): Promise<RespostaIa> {
    this.pedidos.push(p);
    const r = this.responder(p);
    return { texto: typeof r === "string" ? r : JSON.stringify(r), fontesWeb: [] };
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
  const revisoes = new RevisoesService({ repo, processos, contexto, padroes, ia, clock: relogio });
  const pesquisa = new PesquisaService({ padroes, ia });
  const citacoes = new CitacoesService({ repo, biblioteca, contexto, padroes, ia, clock: relogio });
  const fluxos = new FluxosIaService({ repo, processos, contexto, padroes, revisoes, pesquisa, citacoes, biblioteca, ia, clock: relogio });
  return { processos, documentos, padroes, biblioteca, revisoes, fluxos };
}

async function processo(processos: ProcessoRepositoryDocumentos, usuarioId: string, extra: Partial<Processo> = {}): Promise<Processo> {
  const agora = relogio.agora().toISOString();
  const p: Processo = { id: novoId(), cliente: "Maria Souza", polo: "ativo", fase: "triagem", area: "consumidor", criadoEm: agora, atualizadoEm: agora, ...extra };
  await processos.criar(usuarioId, p);
  return p;
}

/** Último bloco de texto do pedido (onde vai o pedido do passo). */
const pedidoDoPasso = (p: PedidoIa) => p.blocos.flatMap((b) => (b.tipo === "texto" ? [b.texto] : [])).at(-1) ?? "";

test("fluxo: valida nome, passos e ordem; limpa etiquetas; modelos prontos são válidos", () => {
  assert.deepEqual(validarFluxo({ titulo: "", passos: [] }), { erro: "Dê um nome ao fluxo.", campo: "titulo" });
  assert.equal("erro" in validarFluxo({ titulo: "X", passos: [] }), true);
  assert.match((validarFluxo({ titulo: "X", passos: [{ ferramenta: "prompt", instrucao: " " }] }) as { erro: string }).erro, /passo 1/);
  assert.match((validarFluxo({ titulo: "X", passos: [{ ferramenta: "traduzir" }] }) as { erro: string }).erro, /ponha antes dele um passo que escreva/);
  assert.match((validarFluxo({ titulo: "X", passos: [{ ferramenta: "biblioteca", instrucao: "Use" }] }) as { erro: string }).erro, /Biblioteca/);
  const ok = validarFluxo({ titulo: " Revisão ", etiquetas: [" A ", "A", "", 3, "B  C"], passos: [{ ferramenta: "prompt", instrucao: "Resuma", perguntas: [{ texto: "lixo" }] }, { ferramenta: "traduzir", idioma: "xx" }] });
  assert.ok("dados" in ok);
  assert.equal(ok.dados.titulo, "Revisão");
  assert.deepEqual(ok.dados.etiquetas, ["A", "B C"]);
  assert.equal(ok.dados.publicado, false);
  assert.equal(ok.dados.passos[0].perguntas, undefined, "pergunta só vale na tabela");
  assert.equal(ok.dados.passos[1].idioma, "en");
  for (const m of MODELOS_FLUXO) assert.ok("dados" in validarFluxo(m), m.titulo);
});

test("fluxo: tabela lê cada processo, o pedido recebe a tabela, a tradução vira o relatório", async () => {
  const ia = new IaFalsa((p) => {
    if (p.esquema) return { respostas: [{ pergunta: 1, resposta: "R$ 5.000,00", justificativa: "Na inicial.", documento: 1, pagina: 2 }] };
    if (p.sistema.startsWith("Traduza")) return "Summary: two cases.";
    return "Resumo: dois processos, nenhum alerta.";
  });
  const { processos, documentos, fluxos } = montar(ia);
  const ana = { id: novoId(), nome: "Ana" };
  const p1 = await processo(processos, ana.id);
  const p2 = await processo(processos, ana.id, { cliente: "João" });
  await documentos.enviar(ana.id, p1.id, { nome: "Inicial.pdf", bytes: pdf("inicial") });
  const fluxo = await fluxos.criar(ana, {
    titulo: "Carteira",
    instrucoes: "Seja objetivo.",
    publicado: true,
    passos: [
      { ferramenta: "revisao_tabela", perguntas: [{ texto: "Valor da causa?", formato: "valor" }] },
      { ferramenta: "prompt", instrucao: "Resuma os alertas." },
      { ferramenta: "verificar_citacoes" },
      { ferramenta: "traduzir", idioma: "en" },
    ],
  });
  assert.deepEqual(await fluxos.listar(ana.id).then((l) => l.map((f) => f.id)), [fluxo.id]);

  await assert.rejects(fluxos.iniciar(ana, fluxo.id, { processos: [] }), erro("dados_invalidos"), "tabela exige processo");
  let exec = await fluxos.iniciar(ana, fluxo.id, { processos: [p1.id, p2.id, novoId()], contexto: "Cliente quer acordo." });
  assert.equal(exec.processos.length, 2);
  assert.equal(exec.estado, "rodando");

  // 1ª volta cria a tabela; a 2ª lê os processos; depois um passo por volta.
  exec = await fluxos.avancar(ana, exec.id);
  assert.equal(exec.resultados[0].estado, "rodando");
  assert.ok(exec.resultados[0].revisaoId);
  for (let i = 0; i < 10 && exec.estado === "rodando"; i++) exec = await fluxos.avancar(ana, exec.id);
  assert.equal(exec.estado, "concluida");
  assert.deepEqual(exec.resultados.map((r) => r.estado), ["feito", "feito", "feito", "feito"]);
  assert.equal(exec.resultados[0].feitos, 2);
  assert.match(exec.resultados[0].texto ?? "", /R\$ 5\.000,00 \[Inicial\.pdf, p\. 2\]/);

  const doPasso = ia.pedidos.find((p) => pedidoDoPasso(p).includes("Resuma os alertas."))!;
  assert.match(pedidoDoPasso(doPasso), /Seja objetivo\./);
  assert.match(pedidoDoPasso(doPasso), /Cliente quer acordo\./);
  const anteriores = doPasso.blocos.find((b) => b.tipo === "documento" && b.titulo === "Resultado dos passos anteriores");
  assert.ok(anteriores && anteriores.tipo === "documento" && anteriores.texto.includes("R$ 5.000,00"), "o pedido recebe a tabela");
  assert.ok(!doPasso.blocos.some((b) => b.tipo === "pdf"), "com vários processos, os PDFs vão pela tabela");

  assert.equal(exec.resultados[2].resumo, "Nenhuma citação encontrada no texto.");
  assert.equal(exec.relatorio, "Summary: two cases.");
  assert.equal((await fluxos.listarExecucoes(ana.id)).length, 1);
});

test("fluxo: com um processo o pedido lê os PDFs; erro para o fluxo, tentar de novo e pular seguem", async () => {
  let falhar = true;
  const ia = new IaFalsa(() => {
    if (falhar) throw new Error("caiu");
    return "Texto do passo.";
  });
  const { processos, documentos, fluxos } = montar(ia);
  const ana = { id: novoId(), nome: "Ana" };
  const p = await processo(processos, ana.id);
  await documentos.enviar(ana.id, p.id, { nome: "Inicial.pdf", bytes: pdf("inicial") });
  const fluxo = await fluxos.criar(ana, { titulo: "Dois pedidos", passos: [{ ferramenta: "prompt", instrucao: "Primeiro." }, { ferramenta: "prompt", instrucao: "Segundo." }] });
  let exec = await fluxos.iniciar(ana, fluxo.id, { processos: [p.id] });

  exec = await fluxos.avancar(ana, exec.id);
  assert.equal(exec.resultados[0].estado, "erro");
  assert.equal(exec.estado, "rodando");
  assert.equal(passoAtual(exec)?.passoId, exec.passos[0].id, "o passo com erro continua sendo o da vez");

  falhar = false;
  exec = await fluxos.avancar(ana, exec.id);
  assert.equal(exec.resultados[0].estado, "feito");
  assert.ok(ia.pedidos.at(-1)!.blocos.some((b) => b.tipo === "pdf"), "um processo: a IA lê o PDF");

  exec = await fluxos.avancar(ana, exec.id, { pular: true });
  assert.equal(exec.resultados[1].estado, "pulado");
  assert.equal(exec.estado, "concluida");
  assert.equal(exec.relatorio, "Texto do passo.");
});

test("fluxo: rascunho é de quem criou, execução é pessoal e sem IA nada roda", async () => {
  const { processos, fluxos } = montar();
  const ana = { id: novoId(), nome: "Ana" };
  await processo(processos, ana.id);
  const f = await fluxos.criar(ana, { titulo: "Rascunho", passos: [{ ferramenta: "prompt", instrucao: "Faça." }] });
  assert.equal(f.publicado, false);
  await assert.rejects(fluxos.iniciar(ana, f.id, {}), erro("indisponivel"));
  const editado = await fluxos.atualizar(ana.id, f.id, { titulo: "Publicado", publicado: true, passos: f.passos });
  assert.equal(editado.publicado, true);
  assert.equal(editado.passos[0].id, f.passos[0].id, "passo mantém o id");
  await assert.rejects(fluxos.obterExecucao(ana.id, novoId()), erro("nao_encontrado"));
  await fluxos.excluir(ana.id, f.id);
  await assert.rejects(fluxos.obter(ana.id, f.id), erro("nao_encontrado"));
});

test("relatório: último texto escrito; citações pendentes vão junto", () => {
  const passos = [
    { id: "a", ferramenta: "prompt" as const, instrucao: "x" },
    { id: "b", ferramenta: "verificar_citacoes" as const },
  ];
  const base = { passos, resultados: [{ passoId: "a", estado: "feito" as const, texto: "Parecer." }, { passoId: "b", estado: "feito" as const, resumo: "2 citação(ões) conferida(s); 1 pedem atenção.", texto: "Verificação das citações:\n- Súmula 1/STJ" }] };
  assert.equal(ultimoTexto(base), "Parecer.");
  assert.equal(relatorioDe(base), "Parecer.\n\nVerificação das citações:\n- Súmula 1/STJ");
  assert.equal(relatorioDe({ ...base, resultados: [base.resultados[0], { ...base.resultados[1], resumo: "1 citação(ões) conferida(s); nenhuma pendência." }] }), "Parecer.");
});
