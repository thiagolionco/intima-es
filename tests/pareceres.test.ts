import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { LIMITES_PARECER } from "../lib/processos.ts";
import type { Usuario } from "../server/auth/model.ts";
import { novoId } from "../server/core/crypto.ts";
import { AppError } from "../server/core/errors.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { comEscritorio } from "../server/infra/postgres/contexto.ts";
import { ParecerRepositoryPostgres } from "../server/infra/postgres/pareceres.ts";
import { ProcessoRepositoryPostgres } from "../server/infra/postgres/processos.ts";
import { UsuarioRepositoryPostgres } from "../server/infra/postgres/repositorios.ts";
import { processoPareceres } from "../server/infra/postgres/schema.ts";
import { type ParecerRepository, ParecerRepositoryDocumentos, PareceresService } from "../server/processos/pareceres.ts";
import { type ProcessoRepository, ProcessoRepositoryDocumentos, ProcessosService } from "../server/processos/processos.ts";
import { type BancoDeTeste, criarBancoDeTeste, URL_TESTE } from "./apoio/postgres.ts";

const relogio = { agora: () => new Date("2026-10-12T12:00:00Z") };
const erro = (codigo: string) => (e: unknown) => e instanceof AppError && e.codigo === codigo;
const codigoPg = (e: unknown) => (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;

function cnj(sequencial: string): string {
  const base = `${sequencial.padStart(7, "0")}2024826` + "0100";
  let r = 0;
  for (const c of `${base}00`) r = (r * 10 + Number(c)) % 97;
  return `${base.slice(0, 7)}${String(98 - r).padStart(2, "0")}${base.slice(7)}`;
}

/** Comportamento comum às duas implementações. */
async function contrato(processosRepo: ProcessoRepository, repo: ParecerRepository, ana: string, beto: string) {
  const pareceres = new PareceresService({ repo, processos: processosRepo, clock: relogio });
  const processos = new ProcessosService(processosRepo, relogio, {
    caminhosDoProcesso: async () => [],
    aposExcluirProcesso: (u, p) => pareceres.excluirDoProcesso(u, p),
  });
  const p = await processos.criar(ana, { numero: cnj("111"), cliente: "Alfa", polo: "ativo" });
  const doBeto = await processos.criar(beto, { numero: cnj("222"), cliente: "Beta", polo: "passivo" });
  const autora = { id: ana, nome: "Ana Lima" };

  assert.deepEqual(await pareceres.listar(ana, p.id), []);
  const v1 = await pareceres.salvar(autora, p.id, { texto: "  Risco baixo.\r\nTese forte.  ", baseVersao: 0 });
  assert.equal(v1.versao, 1);
  assert.equal(v1.texto, "Risco baixo.\nTese forte.");
  assert.equal(v1.autorNome, "Ana Lima");

  // Cada gravação vira uma versão nova; a anterior continua lá.
  const v2 = await pareceres.salvar(autora, p.id, { texto: "Risco médio após a contestação.", baseVersao: 1 });
  assert.equal(v2.versao, 2);
  assert.deepEqual((await pareceres.listar(ana, p.id)).map((x) => x.versao), [2, 1]);

  // Quem editava a partir da versão 1 não passa por cima da 2.
  await assert.rejects(pareceres.salvar(autora, p.id, { texto: "Outro texto", baseVersao: 1 }), (e) => erro("conflito")(e) && (e as AppError).detalhes?.versao === 2);
  await assert.rejects(pareceres.salvar(autora, p.id, { texto: "Risco médio após a contestação.", baseVersao: 2 }), erro("dados_invalidos"));
  await assert.rejects(pareceres.salvar(autora, p.id, { texto: "   ", baseVersao: 2 }), erro("dados_invalidos"));
  await assert.rejects(pareceres.salvar(autora, p.id, { texto: "x".repeat(LIMITES_PARECER.caracteres + 1), baseVersao: 2 }), erro("dados_invalidos"));
  await assert.rejects(pareceres.salvar(autora, p.id, { texto: "ok", baseVersao: -1 }), erro("dados_invalidos"));

  // Beto não lê nem escreve no processo da Ana.
  await assert.rejects(pareceres.listar(beto, p.id), erro("nao_encontrado"));
  await assert.rejects(pareceres.salvar({ id: beto, nome: "Beto" }, p.id, { texto: "intruso", baseVersao: 2 }), erro("nao_encontrado"));
  await pareceres.salvar({ id: beto, nome: "Beto" }, doBeto.id, { texto: "Parecer do Beto" });
  assert.deepEqual((await pareceres.listar(beto, doBeto.id)).map((x) => x.texto), ["Parecer do Beto"]);

  // Excluir o processo apaga as versões dele, e só dele.
  await processos.excluir(ana, p.id);
  assert.deepEqual(await repo.listar(ana, p.id), []);
  assert.equal((await pareceres.listar(beto, doBeto.id)).length, 1);
  return { pareceres, processos };
}

test("pareceres em arquivo", async () => {
  const banco = new ArmazenamentoEmMemoria();
  const ana = novoId();
  const repo = new ParecerRepositoryDocumentos(banco);
  const { pareceres, processos } = await contrato(new ProcessoRepositoryDocumentos(banco), repo, ana, novoId());
  const outro = await processos.criar(ana, { numero: cnj("333"), cliente: "Alfa", polo: "ativo" });
  await pareceres.salvar({ id: ana, nome: "Ana" }, outro.id, { texto: "Fica até a conta sair" });
  await pareceres.excluirDaConta(ana);
  assert.deepEqual(await repo.listar(ana, outro.id), []);
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

test("pareceres no Postgres: isolados por escritório e sem alteração pelo app", opcoes, async () => {
  await banco.limpar();
  const usuarios = new UsuarioRepositoryPostgres(banco.db);
  const ana = usuario("ana@x.com");
  const beto = usuario("beto@x.com");
  await usuarios.criar(ana);
  await usuarios.criar(beto);
  const processosRepo = new ProcessoRepositoryPostgres(banco.db);
  const { pareceres, processos } = await contrato(processosRepo, new ParecerRepositoryPostgres(banco.db), ana.id, beto.id);

  // O papel do app só lê e acrescenta: uma versão gravada não muda nem é apagada.
  const p = await processos.criar(ana.id, { numero: cnj("444"), cliente: "Alfa", polo: "ativo" });
  const v1 = await pareceres.salvar({ id: ana.id, nome: "Ana" }, p.id, { texto: "Original" });
  await assert.rejects(
    comEscritorio(banco.db, ana.id, (tx) => tx.update(processoPareceres).set({ texto: "adulterado" }).where(eq(processoPareceres.id, v1.id))),
    (e) => codigoPg(e) === "42501",
  );
  await assert.rejects(
    comEscritorio(banco.db, ana.id, (tx) => tx.delete(processoPareceres).where(eq(processoPareceres.id, v1.id))),
    (e) => codigoPg(e) === "42501",
  );
  assert.equal((await pareceres.listar(ana.id, p.id))[0].texto, "Original");

  // Dois salvamentos ao mesmo tempo sobre a mesma versão: um entra, o outro recebe conflito.
  const corrida = await Promise.allSettled([
    pareceres.salvar({ id: ana.id, nome: "Ana" }, p.id, { texto: "A", baseVersao: 1 }),
    pareceres.salvar({ id: ana.id, nome: "Ana" }, p.id, { texto: "B", baseVersao: 1 }),
  ]);
  assert.equal(corrida.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(corrida.some((r) => r.status === "rejected" && erro("conflito")(r.reason)));

  // A Ana sai e o escritório dela some junto com os pareceres.
  await usuarios.excluir(ana.id);
  await usuarios.excluir(beto.id);
  assert.equal((await banco.db.select().from(processoPareceres)).length, 0);
});
