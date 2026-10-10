import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Usuario } from "../server/auth/model.ts";
import { novoId } from "../server/core/crypto.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { importarDeDocumentos } from "../server/infra/postgres/importar.ts";
import { AuditoriaPostgres, EspacoTrabalhoRepositoryPostgres, SessaoRepositoryPostgres, UsuarioRepositoryPostgres } from "../server/infra/postgres/repositorios.ts";
import { AuditoriaDocumentos, SessaoRepositoryDocumentos, UsuarioRepositoryDocumentos } from "../server/infra/repositorios.ts";
import { EspacoTrabalhoRepositoryDocumentos } from "../server/workspace/espaco-trabalho.ts";
import { type BancoDeTeste, criarBancoDeTeste, URL_TESTE } from "./apoio/postgres.ts";

const relogio = { agora: () => new Date("2026-10-10T12:00:00Z") };
const opcoes = { skip: URL_TESTE ? false : "defina TEST_DATABASE_URL para testar a importação para o Postgres" };
let banco: BancoDeTeste;

before(async () => {
  if (URL_TESTE) banco = await criarBancoDeTeste();
});
after(async () => {
  await banco?.encerrar();
});

function usuario(nome: string, email: string): Usuario {
  const t = "2026-10-01T09:00:00.000Z";
  return { id: novoId(), nome, email, senhaHash: "scrypt$x", emailConfirmadoEm: t, totpAtivo: false, codigosRecuperacao: [], tentativasFalhas: 0, senhaAlteradaEm: t, aceitouTermosEm: t, criadoEm: t, atualizadoEm: t };
}

test("importa contas, espaço de trabalho, auditoria e sessões, sem duplicar ao repetir", opcoes, async () => {
  const origem = new ArmazenamentoEmMemoria();
  const ana = usuario("Ana Souza", "ana@alfa.adv.br");
  await new UsuarioRepositoryDocumentos(origem).criar(ana);
  await new EspacoTrabalhoRepositoryDocumentos(origem, relogio).salvar(ana.id, { intimacoes: [{ id: "i1" } as never, { id: "i2" } as never], termos: [] }, 0);
  const auditoriaDoc = new AuditoriaDocumentos(origem, relogio);
  await auditoriaDoc.registrar({ usuarioId: ana.id, tipo: "conta.criada", ip: "1.1.1.1", userAgent: "x" });
  await auditoriaDoc.registrar({ usuarioId: ana.id, tipo: "login.sucesso", ip: "1.1.1.1", userAgent: "x" });
  await new SessaoRepositoryDocumentos(origem, relogio).salvar({
    id: "s1", usuarioId: ana.id, criadaEm: "2026-10-10T11:00:00.000Z", ultimoUsoEm: "2026-10-10T11:00:00.000Z",
    expiraEm: "2026-10-10T19:00:00.000Z", lembrar: false, ip: "1.1.1.1", userAgent: "x",
  });

  const r = await importarDeDocumentos(origem, banco.db, relogio);
  assert.deepEqual(r.importados, ["ana@alfa.adv.br"]);
  assert.equal(r.intimacoes, 2);
  assert.equal(r.eventos, 2);
  assert.equal(r.sessoes, 1);

  const doBanco = await new UsuarioRepositoryPostgres(banco.db).porEmail("ana@alfa.adv.br");
  assert.deepEqual(doBanco, ana, "a conta chega idêntica");
  const espaco = await new EspacoTrabalhoRepositoryPostgres(banco.db, relogio).ler(ana.id);
  assert.deepEqual(espaco.intimacoes.map((i) => i.id), ["i1", "i2"]);
  assert.equal(espaco.revisao, 1, "a revisão é preservada");
  const eventos = await new AuditoriaPostgres(banco.db, relogio).doUsuario(ana.id);
  assert.deepEqual(eventos.map((e) => e.tipo), ["login.sucesso", "conta.criada"], "mais recente primeiro, como antes");
  assert.ok(await new SessaoRepositoryPostgres(banco.db, relogio).porId("s1"), "quem estava logado continua logado");

  const deNovo = await importarDeDocumentos(origem, banco.db, relogio);
  assert.deepEqual(deNovo.importados, []);
  assert.deepEqual(deNovo.ignorados, [{ email: "ana@alfa.adv.br", motivo: "já existe no banco" }]);
});
