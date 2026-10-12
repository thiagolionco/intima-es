import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import type { Usuario } from "../server/auth/model.ts";
import { novoId } from "../server/core/crypto.ts";
import { AppError } from "../server/core/errors.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { ArquivosEmMemoria } from "../server/infra/arquivos.ts";
import { AnaliseRepositoryPostgres } from "../server/infra/postgres/analises.ts";
import { comEscritorio } from "../server/infra/postgres/contexto.ts";
import { DocumentoRepositoryPostgres } from "../server/infra/postgres/documentos.ts";
import { ProcessoRepositoryPostgres } from "../server/infra/postgres/processos.ts";
import { UsuarioRepositoryPostgres } from "../server/infra/postgres/repositorios.ts";
import { processoAnalises } from "../server/infra/postgres/schema.ts";
import { AnalisadorClaude } from "../server/processos/analisador-claude.ts";
import { type AnalisadorRisco, type AnaliseRepository, AnaliseRepositoryDocumentos, AnalisesService, normalizarResultado, type ResultadoBruto } from "../server/processos/analises.ts";
import { type DocumentoRepository, DocumentoRepositoryDocumentos, DocumentosService } from "../server/processos/documentos.ts";
import { type ProcessoRepository, ProcessoRepositoryDocumentos, ProcessosService } from "../server/processos/processos.ts";
import { type BancoDeTeste, criarBancoDeTeste, URL_TESTE } from "./apoio/postgres.ts";

const relogio = { agora: () => new Date("2026-10-12T12:00:00Z") };
const pdf = (texto: string) => new TextEncoder().encode(`%PDF-1.7\n${texto}\n%%EOF`);
const erro = (codigo: string) => (e: unknown) => e instanceof AppError && e.codigo === codigo;
const codigoPg = (e: unknown) => (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;

function cnj(sequencial: string): string {
  const base = `${sequencial.padStart(7, "0")}2024826` + "0100";
  let r = 0;
  for (const c of `${base}00`) r = (r * 10 + Number(c)) % 97;
  return `${base.slice(0, 7)}${String(98 - r).padStart(2, "0")}${base.slice(7)}`;
}

test("ponto sem documento ou página válidos não entra na análise", () => {
  const docs = [
    { id: "d1", nome: "Inicial.pdf" },
    { id: "d2", nome: "Contestação.pdf" },
  ];
  const r = normalizarResultado(
    {
      nivel: "medio",
      justificativa: "  Há prova documental, mas a prescrição é discutível. ",
      pontosFortes: [
        { texto: "Contrato assinado", documento: 1, pagina: 3 },
        { texto: "Documento que não existe", documento: 3, pagina: 1 },
        { texto: "Sem página", documento: 2, pagina: 0 },
      ],
      pontosFracos: [{ texto: "Prescrição de parte das parcelas", documento: 2, pagina: 7 }, { texto: "", documento: 1, pagina: 1 }],
    },
    docs,
  );
  assert.equal(r.nivel, "medio");
  assert.equal(r.justificativa, "Há prova documental, mas a prescrição é discutível.");
  assert.deepEqual(r.pontosFortes, [{ texto: "Contrato assinado", documentoId: "d1", documentoNome: "Inicial.pdf", pagina: 3 }]);
  assert.deepEqual(r.pontosFracos, [{ texto: "Prescrição de parte das parcelas", documentoId: "d2", documentoNome: "Contestação.pdf", pagina: 7 }]);
  assert.equal(normalizarResultado({ nivel: "altíssimo", justificativa: "x" }, docs).nivel, "indeterminado");
  assert.throws(() => normalizarResultado({ nivel: "baixo", justificativa: " " }, docs));
});

/** Responde como a API em streaming, devolvendo `json` como texto. */
function respostaSse(json: unknown): Response {
  const eventos = [
    ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: JSON.stringify(json) } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 20 } }],
    ["message_stop", { type: "message_stop" }],
  ];
  const corpo = eventos.map(([nome, dados]) => `event: ${nome}\ndata: ${JSON.stringify(dados)}\n\n`).join("");
  return new Response(corpo, { headers: { "content-type": "text/event-stream" } });
}

test("Claude: envia os PDFs, os dados do processo e pede o formato fixo", async () => {
  let pedido: Record<string, unknown> = {};
  let cabecalhos = new Headers();
  const resultado: ResultadoBruto = { nivel: "baixo", justificativa: "Prova forte.", pontosFortes: [{ texto: "Contrato", documento: 1, pagina: 2 }], pontosFracos: [] };
  const fetchFalso = (async (_url: string, init: RequestInit) => {
    pedido = JSON.parse(String(init.body));
    cabecalhos = new Headers(init.headers);
    return respostaSse(resultado);
  }) as typeof fetch;
  const a = new AnalisadorClaude({ chave: "teste", modelo: "claude-opus-5-5", fetch: fetchFalso });
  const r = await a.analisar({
    processo: { id: novoId(), numero: cnj("111"), cliente: "Construtora Alfa", polo: "ativo", parteContraria: "Banco Beta", criadoEm: "", atualizadoEm: "" },
    documentos: [{ nome: "Inicial.pdf", bytes: pdf("inicial") }],
  });
  assert.deepEqual(r, resultado);
  assert.equal(pedido.model, "claude-opus-5-5");
  assert.equal(pedido.stream, true);
  assert.equal((pedido.output_config as { format: { type: string } }).format.type, "json_schema");
  assert.match(cabecalhos.get("anthropic-beta") ?? "", /server-side-fallback/);
  const [conteudo] = pedido.messages as { content: { type: string; title?: string; source?: { data: string }; text?: string }[] }[];
  assert.equal(conteudo.content[0].type, "document");
  assert.equal(conteudo.content[0].title, "Inicial.pdf");
  assert.equal(Buffer.from(conteudo.content[0].source!.data, "base64").toString(), "%PDF-1.7\ninicial\n%%EOF");
  assert.match(conteudo.content[1].text!, /Construtora Alfa \(Autor/);
  assert.match(conteudo.content[1].text!, /1\. Inicial\.pdf/);
});

/** Analisador falso: aponta a página 1 do primeiro documento e guarda o que leu. */
class AnalisadorFalso implements AnalisadorRisco {
  readonly modelo = "falso";
  lidos: string[][] = [];
  async analisar({ documentos }: { documentos: { nome: string; bytes: Uint8Array }[] }): Promise<ResultadoBruto> {
    this.lidos.push(documentos.map((d) => d.nome));
    return { nivel: "alto", justificativa: "Risco alto.", pontosFortes: [], pontosFracos: [{ texto: "Revelia", documento: 1, pagina: 1 }] };
  }
}

async function contrato(processosRepo: ProcessoRepository, docsRepo: DocumentoRepository, repo: AnaliseRepository, ana: string, beto: string) {
  const docs = new DocumentosService({ repo: docsRepo, processos: processosRepo, arquivos: new ArquivosEmMemoria(), clock: relogio });
  const analisador = new AnalisadorFalso();
  let chamadas = 0;
  const analises = new AnalisesService({ repo, processos: processosRepo, documentos: docs, analisador, clock: relogio, limitar: () => void chamadas++ });
  const processos = new ProcessosService(processosRepo, relogio, {
    caminhosDoProcesso: (u, p) => docs.caminhosDoProcesso(u, p),
    async aposExcluirProcesso(u, p, c) {
      await analises.excluirDoProcesso(u, p);
      await docs.aposExcluirProcesso(u, p, c);
    },
  });
  const p = await processos.criar(ana, { numero: cnj("111"), cliente: "Alfa", polo: "ativo" });
  const doBeto = await processos.criar(beto, { numero: cnj("222"), cliente: "Beta", polo: "passivo" });
  const autora = { id: ana, nome: "Ana Lima" };

  // Sem a IA ligada, nada é enviado.
  const desligada = new AnalisesService({ repo, processos: processosRepo, documentos: docs, clock: relogio });
  assert.equal(desligada.disponivel, false);
  await assert.rejects(desligada.analisar(autora, p.id), erro("indisponivel"));

  await assert.rejects(analises.analisar(autora, p.id), erro("dados_invalidos"), "sem PDF não há o que analisar");
  const inicial = await docs.enviar(ana, p.id, { nome: "Inicial.pdf", bytes: pdf("inicial") });
  const a1 = await analises.analisar(autora, p.id);
  assert.equal(a1.nivel, "alto");
  assert.equal(a1.autorNome, "Ana Lima");
  assert.deepEqual(a1.documentos, [{ id: inicial.id, nome: "Inicial.pdf" }]);
  assert.deepEqual(a1.pontosFracos, [{ texto: "Revelia", documentoId: inicial.id, documentoNome: "Inicial.pdf", pagina: 1 }]);

  // Reanalisar com um PDF novo guarda as duas análises; a mais nova vem primeiro e lê os dois.
  await docs.enviar(ana, p.id, { nome: "Contestação.pdf", bytes: pdf("contestacao") });
  const relogioDepois = { agora: () => new Date("2026-10-12T13:00:00Z") };
  const depois = new AnalisesService({ repo, processos: processosRepo, documentos: docs, analisador, clock: relogioDepois });
  const a2 = await depois.analisar(autora, p.id);
  assert.deepEqual((await analises.listar(ana, p.id)).map((x) => x.id), [a2.id, a1.id]);
  assert.equal(analisador.lidos.at(-1)?.length, 2);
  assert.equal(chamadas, 1, "cada análise passa pelo limite diário");

  // Beto não lê nem pede análise do processo da Ana.
  await assert.rejects(analises.listar(beto, p.id), erro("nao_encontrado"));
  await assert.rejects(analises.analisar({ id: beto, nome: "Beto" }, p.id), erro("nao_encontrado"));
  assert.deepEqual(await analises.listar(beto, doBeto.id), []);

  // Excluir o processo apaga as análises.
  await processos.excluir(ana, p.id);
  assert.deepEqual(await repo.listar(ana, p.id), []);
  return { analises, processos, docs };
}

test("análises em arquivo", async () => {
  const banco = new ArmazenamentoEmMemoria();
  const ana = novoId();
  const repo = new AnaliseRepositoryDocumentos(banco);
  const { analises, processos, docs } = await contrato(new ProcessoRepositoryDocumentos(banco), new DocumentoRepositoryDocumentos(banco), repo, ana, novoId());
  const outro = await processos.criar(ana, { numero: cnj("333"), cliente: "Alfa", polo: "ativo" });
  await docs.enviar(ana, outro.id, { nome: "x.pdf", bytes: pdf("x") });
  await analises.analisar({ id: ana, nome: "Ana" }, outro.id);
  await analises.excluirDaConta(ana);
  assert.deepEqual(await repo.listar(ana, outro.id), []);
});

test("duas análises do mesmo processo ao mesmo tempo: a segunda é recusada", async () => {
  const banco = new ArmazenamentoEmMemoria();
  const ana = novoId();
  const processosRepo = new ProcessoRepositoryDocumentos(banco);
  const docs = new DocumentosService({ repo: new DocumentoRepositoryDocumentos(banco), processos: processosRepo, arquivos: new ArquivosEmMemoria(), clock: relogio });
  let liberar!: () => void;
  const lento: AnalisadorRisco = {
    modelo: "lento",
    analisar: () => new Promise((ok) => (liberar = () => ok({ nivel: "baixo", justificativa: "ok", pontosFortes: [], pontosFracos: [] }))),
  };
  const analises = new AnalisesService({ repo: new AnaliseRepositoryDocumentos(banco), processos: processosRepo, documentos: docs, analisador: lento, clock: relogio });
  const p = await new ProcessosService(processosRepo, relogio).criar(ana, { numero: cnj("444"), cliente: "Alfa", polo: "ativo" });
  await docs.enviar(ana, p.id, { nome: "a.pdf", bytes: pdf("a") });
  const primeira = analises.analisar({ id: ana, nome: "Ana" }, p.id);
  await new Promise((ok) => setTimeout(ok, 20));
  await assert.rejects(analises.analisar({ id: ana, nome: "Ana" }, p.id), erro("conflito"));
  liberar();
  assert.equal((await primeira).nivel, "baixo");
});

const opcoes = { skip: URL_TESTE ? false : "defina TEST_DATABASE_URL para testar o Postgres" };
let banco: BancoDeTeste;
before(async () => {
  if (URL_TESTE) banco = await criarBancoDeTeste();
});
after(async () => {
  await banco?.encerrar();
});

function usuario(email: string): Usuario {
  const t = "2026-10-01T09:00:00.000Z";
  return { id: novoId(), nome: "Ana", email, senhaHash: "scrypt$x", emailConfirmadoEm: t, totpAtivo: false, codigosRecuperacao: [], tentativasFalhas: 0, senhaAlteradaEm: t, aceitouTermosEm: t, criadoEm: t, atualizadoEm: t };
}

test("análises no Postgres: isoladas por escritório e sem alteração pelo app", opcoes, async () => {
  await banco.limpar();
  const usuarios = new UsuarioRepositoryPostgres(banco.db);
  const ana = usuario("ana@x.com");
  const beto = usuario("beto@x.com");
  await usuarios.criar(ana);
  await usuarios.criar(beto);
  const processosRepo = new ProcessoRepositoryPostgres(banco.db);
  const { analises, processos, docs } = await contrato(processosRepo, new DocumentoRepositoryPostgres(banco.db), new AnaliseRepositoryPostgres(banco.db), ana.id, beto.id);

  const p = await processos.criar(ana.id, { numero: cnj("555"), cliente: "Alfa", polo: "ativo" });
  await docs.enviar(ana.id, p.id, { nome: "a.pdf", bytes: pdf("a") });
  const a = await analises.analisar({ id: ana.id, nome: "Ana" }, p.id);
  assert.deepEqual((await analises.listar(ana.id, p.id))[0], a, "volta do banco igual ao que foi gravado");
  await assert.rejects(
    comEscritorio(banco.db, ana.id, (tx) => tx.update(processoAnalises).set({ nivel: "baixo" }).where(eq(processoAnalises.id, a.id))),
    (e) => codigoPg(e) === "42501",
  );
  await assert.rejects(
    comEscritorio(banco.db, ana.id, (tx) => tx.delete(processoAnalises).where(eq(processoAnalises.id, a.id))),
    (e) => codigoPg(e) === "42501",
  );

  await usuarios.excluir(ana.id);
  await usuarios.excluir(beto.id);
  assert.equal((await banco.db.select().from(processoAnalises)).length, 0);
});
