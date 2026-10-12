import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Usuario } from "../server/auth/model.ts";
import { novoId } from "../server/core/crypto.ts";
import { AppError } from "../server/core/errors.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { ArquivosEmDisco, ArquivosEmMemoria, ArquivosSupabase } from "../server/infra/arquivos.ts";
import { DocumentoRepositoryPostgres } from "../server/infra/postgres/documentos.ts";
import { ProcessoRepositoryPostgres } from "../server/infra/postgres/processos.ts";
import { UsuarioRepositoryPostgres } from "../server/infra/postgres/repositorios.ts";
import { processoDocumentos } from "../server/infra/postgres/schema.ts";
import { type DocumentoRepository, DocumentoRepositoryDocumentos, DocumentosService, limparNome } from "../server/processos/documentos.ts";
import { type ProcessoRepository, ProcessoRepositoryDocumentos, ProcessosService } from "../server/processos/processos.ts";
import { type BancoDeTeste, criarBancoDeTeste, URL_TESTE } from "./apoio/postgres.ts";

const relogio = { agora: () => new Date("2026-10-12T12:00:00Z") };
const pdf = (texto: string) => new TextEncoder().encode(`%PDF-1.7\n${texto}\n%%EOF`);
const erro = (codigo: string) => (e: unknown) => e instanceof AppError && e.codigo === codigo;

function cnj(sequencial: string): string {
  const base = `${sequencial.padStart(7, "0")}2024826` + "0100";
  let r = 0;
  for (const c of `${base}00`) r = (r * 10 + Number(c)) % 97;
  return `${base.slice(0, 7)}${String(98 - r).padStart(2, "0")}${base.slice(7)}`;
}

test("limpa o nome do arquivo", () => {
  assert.equal(limparNome("C:\\pasta\\Inicial.PDF"), "Inicial.pdf");
  assert.equal(limparNome("../../etc/passwd"), "passwd.pdf");
  assert.equal(limparNome('a"b\u0000c.pdf'), "abc.pdf");
  assert.equal(limparNome(""), "documento.pdf");
});

test("arquivos em disco: grava, lê, remove e recusa caminhos perigosos", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "arquivos-"));
  try {
    const a = new ArquivosEmDisco(dir);
    await a.gravar("processos/x/1.pdf", pdf("um"), "application/pdf");
    assert.deepEqual(await a.ler("processos/x/1.pdf"), pdf("um"));
    await a.remover(["processos/x/1.pdf", "processos/x/nao-existe.pdf"]);
    assert.equal(await a.ler("processos/x/1.pdf"), null);
    await assert.rejects(a.gravar("../fora.pdf", pdf("x"), "application/pdf"));
    await assert.rejects(a.ler("/etc/passwd"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Supabase Storage: monta as chamadas da API", async () => {
  const chamadas: { url: string; metodo: string; auth: string | null; corpo?: string }[] = [];
  const respostas: Response[] = [new Response("{}"), new Response(pdf("x")), new Response('{"statusCode":"404"}', { status: 400 }), new Response("[]")];
  const buscar = (async (url: string, init: RequestInit = {}) => {
    const h = new Headers(init.headers);
    chamadas.push({ url, metodo: init.method ?? "GET", auth: h.get("authorization"), corpo: typeof init.body === "string" ? init.body : undefined });
    return respostas.shift()!;
  }) as typeof fetch;
  const s = new ArquivosSupabase({ url: "https://abc.supabase.co/", chave: "segredo", bucket: "processos", buscar });
  await s.gravar("processos/p/1.pdf", pdf("x"), "application/pdf");
  assert.deepEqual(await s.ler("processos/p/1.pdf"), pdf("x"));
  assert.equal(await s.ler("processos/p/2.pdf"), null);
  await s.remover(["processos/p/1.pdf"]);
  assert.deepEqual(
    chamadas.map((c) => `${c.metodo} ${c.url}`),
    [
      "POST https://abc.supabase.co/storage/v1/object/processos/processos/p/1.pdf",
      "GET https://abc.supabase.co/storage/v1/object/processos/processos/p/1.pdf",
      "GET https://abc.supabase.co/storage/v1/object/processos/processos/p/2.pdf",
      "DELETE https://abc.supabase.co/storage/v1/object/processos",
    ],
  );
  assert.ok(chamadas.every((c) => c.auth === "Bearer segredo"));
  assert.equal(chamadas[3].corpo, JSON.stringify({ prefixes: ["processos/p/1.pdf"] }));
});

/** Comportamento comum às duas implementações. */
async function contrato(processosRepo: ProcessoRepository, docsRepo: DocumentoRepository, ana: string, beto: string) {
  const arquivos = new ArquivosEmMemoria();
  const docs = new DocumentosService({ repo: docsRepo, processos: processosRepo, arquivos, clock: relogio });
  const processos = new ProcessosService(processosRepo, relogio, docs);
  const p = await processos.criar(ana, { numero: cnj("111"), cliente: "Alfa", polo: "ativo" });
  const doBeto = await processos.criar(beto, { numero: cnj("222"), cliente: "Beta", polo: "passivo" });

  const d = await docs.enviar(ana, p.id, { nome: "Petição inicial.pdf", bytes: pdf("inicial") });
  assert.equal(d.nome, "Petição inicial.pdf");
  assert.equal(arquivos.dados.size, 1);
  assert.deepEqual((await docs.listar(ana, p.id)).map((x) => x.id), [d.id]);
  assert.ok(!("caminho" in (await docs.listar(ana, p.id))[0]));
  assert.deepEqual((await docs.abrir(ana, p.id, d.id)).bytes, pdf("inicial"));

  await assert.rejects(docs.enviar(ana, p.id, { nome: "de novo.pdf", bytes: pdf("inicial") }), (e) => erro("conflito")(e) && (e as AppError).detalhes?.id === d.id);
  assert.equal(arquivos.dados.size, 1, "o arquivo repetido não fica para trás");
  await assert.rejects(docs.enviar(ana, p.id, { nome: "foto.png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }), erro("dados_invalidos"));
  await assert.rejects(docs.enviar(ana, p.id, { nome: "vazio.pdf", bytes: new Uint8Array() }), erro("dados_invalidos"));

  // Beto não vê, não abre, não apaga e não anexa no processo da Ana.
  await assert.rejects(docs.listar(beto, p.id), erro("nao_encontrado"));
  await assert.rejects(docs.abrir(beto, p.id, d.id), erro("nao_encontrado"));
  await assert.rejects(docs.excluir(beto, p.id, d.id), erro("nao_encontrado"));
  await assert.rejects(docs.enviar(beto, p.id, { nome: "x.pdf", bytes: pdf("intruso") }), erro("nao_encontrado"));
  // Nem pelo processo dele com o id do documento da Ana.
  await assert.rejects(docs.abrir(beto, doBeto.id, d.id), erro("nao_encontrado"));

  const d2 = await docs.enviar(ana, p.id, { nome: "Contestação.pdf", bytes: pdf("contestacao") });
  await docs.excluir(ana, p.id, d2.id);
  assert.deepEqual((await docs.listar(ana, p.id)).map((x) => x.id), [d.id]);
  assert.equal(arquivos.dados.size, 1);

  // Excluir o processo apaga os PDFs dele.
  await docs.enviar(beto, doBeto.id, { nome: "b.pdf", bytes: pdf("beto") });
  await processos.excluir(ana, p.id);
  assert.equal(arquivos.dados.size, 1, "só sobra o PDF do Beto");
  await assert.rejects(docs.abrir(ana, p.id, d.id), erro("nao_encontrado"));
  return { docs, arquivos };
}

test("documentos em arquivo", async () => {
  const banco = new ArmazenamentoEmMemoria();
  const ana = novoId();
  const { docs, arquivos } = await contrato(new ProcessoRepositoryDocumentos(banco), new DocumentoRepositoryDocumentos(banco), ana, novoId());
  const outro = await new ProcessosService(new ProcessoRepositoryDocumentos(banco), relogio).criar(ana, { numero: cnj("333"), cliente: "Alfa", polo: "ativo" });
  await docs.enviar(ana, outro.id, { nome: "c.pdf", bytes: pdf("conta") });
  assert.equal(arquivos.dados.size, 2);
  await docs.excluirDaConta(ana);
  assert.equal(arquivos.dados.size, 1, "a exclusão da conta apaga os PDFs dela");
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

test("documentos no Postgres, isolados por escritório", opcoes, async () => {
  await banco.limpar();
  const usuarios = new UsuarioRepositoryPostgres(banco.db);
  const ana = usuario("ana@x.com");
  const beto = usuario("beto@x.com");
  await usuarios.criar(ana);
  await usuarios.criar(beto);
  const processosRepo = new ProcessoRepositoryPostgres(banco.db);
  const docsRepo = new DocumentoRepositoryPostgres(banco.db);
  const { docs, arquivos } = await contrato(processosRepo, docsRepo, ana.id, beto.id);

  // Conta excluída: os arquivos somem e os metadados vão junto com o escritório.
  await docs.excluirDaConta(beto.id);
  await usuarios.excluir(beto.id);
  assert.equal(arquivos.dados.size, 0);
  assert.equal((await banco.db.select().from(processoDocumentos)).length, 0);
});
