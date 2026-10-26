import { test } from "node:test";
import assert from "node:assert/strict";
import { BibliotecaRepositoryDocumentos, BibliotecaService } from "../server/biblioteca/biblioteca.ts";
import { novoId } from "../server/core/crypto.ts";
import { AppError } from "../server/core/errors.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { ArquivosEmMemoria } from "../server/infra/arquivos.ts";
import { AnaliseRepositoryDocumentos, AnalisesService } from "../server/processos/analises.ts";
import { DocumentoRepositoryDocumentos, DocumentosService } from "../server/processos/documentos.ts";
import { ParecerRepositoryDocumentos, PareceresService } from "../server/processos/pareceres.ts";
import { ProcessoRepositoryDocumentos } from "../server/processos/processos.ts";
import { type EntradaRedacao, normalizarRascunho, RedacaoParecerService, type RedatorParecer } from "../server/processos/redacao-parecer.ts";
import { montarConteudo, RedatorClaude } from "../server/processos/redator-claude.ts";

const relogio = { agora: () => new Date("2026-10-26T12:00:00Z") };
const pdf = (texto: string) => new TextEncoder().encode(`%PDF-1.7\n${texto}\n%%EOF`);
const erro = (codigo: string) => (e: unknown) => e instanceof AppError && e.codigo === codigo;

class RedatorFalso implements RedatorParecer {
  readonly modelo = "falso";
  entradas: EntradaRedacao[] = [];
  async redigir(e: EntradaRedacao) {
    this.entradas.push(e);
    return "```\nSíntese do caso\n\n\n\nO cliente…\n```";
  }
}

function montar(redator?: RedatorParecer) {
  const banco = new ArmazenamentoEmMemoria();
  const arquivos = new ArquivosEmMemoria();
  const processos = new ProcessoRepositoryDocumentos(banco);
  const documentos = new DocumentosService({ repo: new DocumentoRepositoryDocumentos(banco), processos, arquivos, clock: relogio });
  const biblioteca = new BibliotecaService({ repo: new BibliotecaRepositoryDocumentos(banco), arquivos, clock: relogio });
  const pareceres = new PareceresService({ repo: new ParecerRepositoryDocumentos(banco), processos, clock: relogio });
  const analises = new AnalisesService({ repo: new AnaliseRepositoryDocumentos(banco), processos, documentos, clock: relogio });
  let limitadas = 0;
  const servico = new RedacaoParecerService({ processos, documentos, biblioteca, pareceres, analises, redator, limitar: () => void limitadas++ });
  return { processos, documentos, biblioteca, pareceres, servico, limitadas: () => limitadas };
}

test("rascunho: lê os PDFs do processo, os itens escolhidos e o parecer atual, sem gravar nada", async () => {
  const redator = new RedatorFalso();
  const { processos, documentos, biblioteca, pareceres, servico, limitadas } = montar(redator);
  const ana = { id: novoId(), nome: "Ana" };
  const agora = relogio.agora().toISOString();
  const p = { id: novoId(), cliente: "Alfa", polo: "ativo" as const, fase: "triagem" as const, area: "consumidor" as const, criadoEm: agora, atualizadoEm: agora };
  await processos.criar(ana.id, p);
  const outroProcesso = novoId();

  await assert.rejects(servico.redigir(ana.id, p.id, {}), erro("dados_invalidos"), "sem PDF nem item, não há base");
  await assert.rejects(servico.redigir(ana.id, outroProcesso, {}), erro("nao_encontrado"));
  await assert.rejects(servico.redigir(ana.id, p.id, { itens: Array.from({ length: 9 }, () => novoId()) }), erro("dados_invalidos"));

  await documentos.enviar(ana.id, p.id, { nome: "Inicial.pdf", bytes: pdf("inicial") });
  const sumula = await biblioteca.criar(ana, { tipo: "sumula", titulo: "Anotação irregular", referencia: "Súmula 385/STJ", texto: "Da anotação irregular…" });
  const acordao = await biblioteca.criar(ana, { tipo: "jurisprudencia", titulo: "REsp 1", tribunal: "STJ" }, { nome: "a.pdf", bytes: pdf("acordao") });
  await pareceres.salvar(ana, p.id, { texto: "Parecer antigo", baseVersao: 0 });

  const r = await servico.redigir(ana.id, p.id, { itens: [sumula.id, acordao.id, sumula.id, "lixo"], orientacao: "  foque na prescrição " });
  assert.equal(r.texto, "Síntese do caso\n\nO cliente…");
  assert.deepEqual(r.fontes, ["Súmula: Anotação irregular (Súmula 385/STJ)", "Jurisprudência: REsp 1 (STJ)"]);
  assert.deepEqual(r.documentos, ["Inicial.pdf"]);
  assert.equal(limitadas(), 1);

  const [e] = redator.entradas;
  assert.equal(e.parecerAtual, "Parecer antigo");
  assert.equal(e.orientacao, "foque na prescrição");
  assert.equal(e.biblioteca[0].texto, "Da anotação irregular…");
  assert.deepEqual(e.biblioteca[1].pdf, pdf("acordao"));
  assert.deepEqual(e.documentos.map((d) => d.nome), ["Inicial.pdf"]);
  assert.equal((await pareceres.listar(ana.id, p.id)).length, 1, "o rascunho não vira versão sozinho");

  // Outro escritório não usa os itens da Ana.
  const beto = novoId();
  const doBeto = { ...p, id: novoId() };
  await processos.criar(beto, doBeto);
  await assert.rejects(servico.redigir(beto, doBeto.id, { itens: [sumula.id] }), erro("dados_invalidos"));
});

test("rascunho: sem IA ligada, nada é enviado", async () => {
  const { servico } = montar();
  assert.equal(servico.disponivel, false);
  await assert.rejects(servico.redigir(novoId(), novoId(), {}), erro("indisponivel"));
});

test("normalização do rascunho", () => {
  assert.equal(normalizarRascunho("  a\r\n\r\n\r\nb  "), "a\n\nb");
  assert.equal(normalizarRascunho("x".repeat(60_000)).length, 50_000);
});

test("Claude: PDFs como documento, textos da biblioteca como documento de texto e a tarefa no fim", async () => {
  const agora = "2026-10-26T12:00:00Z";
  const entrada: EntradaRedacao = {
    processo: { id: novoId(), cliente: "Alfa", polo: "passivo", fase: "triagem", criadoEm: agora, atualizadoEm: agora, observacoes: "Cliente quer acordo" },
    documentos: [{ nome: "Inicial.pdf", bytes: pdf("inicial") }],
    biblioteca: [
      { tipo: "modelo", titulo: "Contestação padrão", texto: "EXCELENTÍSSIMO…" },
      { tipo: "jurisprudencia", titulo: "REsp 1", tribunal: "STJ", pdf: pdf("acordao") },
    ],
    risco: { nivel: "Risco alto", justificativa: "Revelia." },
    orientacao: "Seja breve.",
  };
  const c = montarConteudo(entrada) as { type: string; title?: string; source?: { type: string; data: string }; text?: string }[];
  assert.deepEqual(c.map((b) => `${b.type}:${b.source?.type ?? ""}`), ["document:base64", "document:text", "document:base64", "text:"]);
  assert.equal(c[0].title, "Processo: Inicial.pdf");
  assert.equal(c[1].title, "Biblioteca · Modelo de peça: Contestação padrão");
  assert.equal(c[1].source?.data, "EXCELENTÍSSIMO…");
  assert.match(c[3].text!, /Réu \(polo passivo\)/);
  assert.match(c[3].text!, /Cliente quer acordo/);
  assert.match(c[3].text!, /Risco alto\. Revelia\./);
  assert.match(c[3].text!, /Seja breve\./);

  let pedido: Record<string, unknown> = {};
  const fetchFalso = (async (_url: string, init: RequestInit) => {
    pedido = JSON.parse(String(init.body));
    const eventos = [
      ["message_start", { type: "message_start", message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Síntese do caso" } }],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 3 } }],
      ["message_stop", { type: "message_stop" }],
    ];
    return new Response(eventos.map(([n, d]) => `event: ${n}\ndata: ${JSON.stringify(d)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;
  const texto = await new RedatorClaude({ chave: "teste", modelo: "claude-opus-5-5", fetch: fetchFalso }).redigir(entrada);
  assert.equal(texto, "Síntese do caso");
  assert.equal(pedido.model, "claude-opus-5-5");
  assert.match(String(pedido.system), /\[conferir\]/);
});
