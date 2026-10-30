import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import type { Usuario } from "../server/auth/model.ts";
import { novoId } from "../server/core/crypto.ts";
import { AppError } from "../server/core/errors.ts";
import { EscritorioService } from "../server/escritorio/escritorio.ts";
import { LimitadorEmMemoria } from "../server/infra/limitador.ts";
import type { MensagemEmail } from "../server/infra/email/ports.ts";
import { EscritorioRepositoryPostgres } from "../server/infra/postgres/escritorio.ts";
import { FluxoRepositoryPostgres } from "../server/infra/postgres/fluxo.ts";
import { FluxoService } from "../server/fluxo/fluxo.ts";
import { motorPadrao } from "../lib/fluxo/motor.ts";
import { ParecerRepositoryPostgres } from "../server/infra/postgres/pareceres.ts";
import { ProcessoRepositoryPostgres } from "../server/infra/postgres/processos.ts";
import { RegistrosRepositoryPostgres } from "../server/infra/postgres/registros.ts";
import { FluxosIaService } from "../server/ia/fluxos.ts";
import { PadroesService } from "../server/ia/padroes.ts";
import { AuditoriaPostgres, EspacoTrabalhoRepositoryPostgres, UsuarioRepositoryPostgres } from "../server/infra/postgres/repositorios.ts";
import { convites, escritorios, membros, processos } from "../server/infra/postgres/schema.ts";
import { ProcessosService } from "../server/processos/processos.ts";
import { RondaComunica } from "../server/rondas/ronda-comunica.ts";
import { EspacoTrabalhoService } from "../server/workspace/espaco-trabalho.ts";
import { type BancoDeTeste, criarBancoDeTeste, URL_TESTE } from "./apoio/postgres.ts";

/**
 * Equipe do escritório no Postgres: convite, aceite, papéis, saída e processos particulares.
 * O que importa aqui é o que o banco deixa (ou não) cada conta ver e fazer.
 */

const opcoes = { skip: URL_TESTE ? false : "defina TEST_DATABASE_URL para rodar os testes da equipe no Postgres" };
const relogio = { agora: () => new Date("2026-10-15T12:00:00Z") };
const ctx = { ip: "127.0.0.1", userAgent: "teste" };

let banco: BancoDeTeste;
let usuariosRepo: UsuarioRepositoryPostgres;
let espacosRepo: EspacoTrabalhoRepositoryPostgres;
let servico: EscritorioService;
let emails: MensagemEmail[];

function usuario(nome: string, email: string): Usuario {
  const agora = relogio.agora().toISOString();
  return { id: novoId(), nome, email, senhaHash: "x", emailConfirmadoEm: agora, totpAtivo: false, codigosRecuperacao: [], tentativasFalhas: 0, senhaAlteradaEm: agora, aceitouTermosEm: agora, criadoEm: agora, atualizadoEm: agora };
}

const tokenDoUltimoEmail = () => /#token=([A-Za-z0-9_-]+)/.exec(emails.at(-1)!.texto)![1];

async function erro(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  assert.fail("era para dar erro");
}

before(async () => {
  if (!URL_TESTE) return;
  banco = await criarBancoDeTeste();
});

beforeEach(async () => {
  if (!URL_TESTE) return;
  await banco.limpar();
  usuariosRepo = new UsuarioRepositoryPostgres(banco.db);
  espacosRepo = new EspacoTrabalhoRepositoryPostgres(banco.db, relogio);
  emails = [];
  servico = new EscritorioService({
    repo: new EscritorioRepositoryPostgres(banco.db),
    usuarios: usuariosRepo,
    espacos: espacosRepo,
    auditoria: new AuditoriaPostgres(banco.db, relogio),
    hash: { gerar: async (s) => `hash:${s}`, verificar: async (s, h) => h === `hash:${s}` },
    limitador: new LimitadorEmMemoria(relogio),
    enviador: { nome: "teste", enviar: async (m) => void emails.push(m) },
    clock: relogio,
    links: { convite: (t) => `http://app/convite#token=${t}`, entrar: () => "http://app/entrar" },
    convitesDisponiveis: true,
  });
});

after(async () => {
  if (URL_TESTE) await banco.encerrar();
});

/** Ana, dona de um escritório com uma intimação e uma pessoa na lista da equipe (sem conta). */
async function escritorioDaAna() {
  const ana = usuario("Ana Souza", "ana@alfa.adv.br");
  await usuariosRepo.criar(ana);
  await espacosRepo.salvar(ana.id, { intimacoes: [{ id: "i1" } as never], termos: [], preferencias: { equipe: [{ id: "p-beto", nome: "Beto Lima", email: "beto@alfa.adv.br" }] } }, 0);
  return ana;
}

test("convite por e-mail: quem não tem conta cria a sua já dentro do escritório e vê o mesmo acervo", opcoes, async () => {
  const ana = await escritorioDaAna();
  await servico.convidar(ana.id, { email: "Beto@Alfa.adv.br", papel: "advogado", pessoaId: "p-beto" }, ctx);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].para, "beto@alfa.adv.br");

  const token = tokenDoUltimoEmail();
  const consulta = await servico.consultarConvite(token, ctx);
  assert.equal(consulta.contaExiste, false);
  assert.equal(consulta.papel, "advogado");

  await servico.aceitarComContaNova(token, { nome: "Beto Lima", senha: "Cavalo-Trovao-Azul-91!", aceitouTermos: true }, ctx);
  const beto = (await usuariosRepo.porEmail("beto@alfa.adv.br"))!;
  assert.ok(beto.emailConfirmadoEm, "o link do e-mail já confirma o endereço");
  assert.equal(await servico.papelDe(beto.id), "advogado");

  const espacoDoBeto = await espacosRepo.ler(beto.id);
  assert.deepEqual(espacoDoBeto.intimacoes.map((i) => i.id), ["i1"]);
  assert.deepEqual(espacoDoBeto.preferencias?.equipe, [{ id: "p-beto", nome: "Beto Lima", email: "beto@alfa.adv.br", usuarioId: beto.id }], "a pessoa da lista ficou ligada à conta");

  const resumo = await servico.resumo(ana.id);
  assert.deepEqual(resumo.membros.map((m) => [m.nome, m.papel]), [["Ana Souza", "dono"], ["Beto Lima", "advogado"]]);
  assert.equal(resumo.convites.length, 0, "convite usado some");
  assert.equal((await erro(servico.consultarConvite(token, ctx))).codigo, "token_invalido", "o link vale uma vez só");
});

test("conta que já existe aceita logada; o escritório próprio vazio some, o com dados é preservado", opcoes, async () => {
  const ana = await escritorioDaAna();
  const carla = usuario("Carla Dias", "carla@alfa.adv.br");
  await usuariosRepo.criar(carla);
  const dani = usuario("Dani Reis", "dani@alfa.adv.br");
  await usuariosRepo.criar(dani);
  await espacosRepo.salvar(dani.id, { intimacoes: [{ id: "da-dani" } as never], termos: [] }, 0);

  await servico.convidar(ana.id, { email: carla.email, papel: "estagiario" }, ctx);
  const tokenCarla = tokenDoUltimoEmail();
  assert.equal((await servico.consultarConvite(tokenCarla, ctx)).contaExiste, true);
  assert.equal((await erro(servico.aceitarComConta(dani, tokenCarla, ctx))).codigo, "sem_permissao", "convite é para o e-mail dele");
  await servico.aceitarComConta(carla, tokenCarla, ctx);
  assert.equal(await servico.papelDe(carla.id), "estagiario");
  const filiacoesCarla = await banco.db.select().from(membros).where(eq(membros.usuarioId, carla.id));
  assert.equal(filiacoesCarla.length, 1, "saiu do escritório próprio, que estava vazio");
  assert.equal((await banco.db.select().from(escritorios)).length, 2, "sobram o da Ana e o da Dani");

  await servico.convidar(ana.id, { email: dani.email, papel: "advogado" }, ctx);
  const e = await erro(servico.aceitarComConta(dani, tokenDoUltimoEmail(), ctx));
  assert.equal(e.codigo, "conflito");
  assert.deepEqual((await espacosRepo.ler(dani.id)).intimacoes.map((i) => i.id), ["da-dani"], "nada da Dani se perdeu");
  assert.equal((await banco.db.select().from(convites)).length, 1, "o convite continua valendo");
});

test("papéis: só o dono convida e muda papéis; o escritório nunca fica sem dono", opcoes, async () => {
  const ana = await escritorioDaAna();
  await servico.convidar(ana.id, { email: "beto@alfa.adv.br", papel: "advogado" }, ctx);
  await servico.aceitarComContaNova(tokenDoUltimoEmail(), { nome: "Beto Lima", senha: "Cavalo-Trovao-Azul-91!", aceitouTermos: true }, ctx);
  const beto = (await usuariosRepo.porEmail("beto@alfa.adv.br"))!;

  assert.equal((await erro(servico.convidar(beto.id, { email: "x@alfa.adv.br", papel: "dono" }, ctx))).codigo, "sem_permissao");
  assert.equal((await erro(servico.alterarPapel(beto.id, beto.id, "dono", ctx))).codigo, "sem_permissao");
  assert.equal((await servico.resumo(beto.id)).convites.length, 0);
  assert.equal((await erro(servico.alterarPapel(ana.id, ana.id, "advogado", ctx))).codigo, "conflito", "última dona");
  assert.equal((await erro(servico.remover(ana.id, ana.id, ctx))).codigo, "conflito");

  await servico.alterarPapel(ana.id, beto.id, "dono", ctx);
  await servico.alterarPapel(beto.id, ana.id, "advogado", ctx);
  assert.equal(await servico.papelDe(ana.id), "advogado");
});

test("quem sai do escritório recomeça num próprio, vazio, e fica inativo na lista da equipe", opcoes, async () => {
  const ana = await escritorioDaAna();
  await servico.convidar(ana.id, { email: "beto@alfa.adv.br", papel: "advogado", pessoaId: "p-beto" }, ctx);
  await servico.aceitarComContaNova(tokenDoUltimoEmail(), { nome: "Beto Lima", senha: "Cavalo-Trovao-Azul-91!", aceitouTermos: true }, ctx);
  const beto = (await usuariosRepo.porEmail("beto@alfa.adv.br"))!;

  await servico.remover(ana.id, beto.id, ctx);
  assert.deepEqual((await espacosRepo.ler(beto.id)).intimacoes, [], "não vê mais nada do escritório");
  assert.equal(await servico.papelDe(beto.id), "dono", "é dono do escritório novo dele");
  assert.deepEqual((await espacosRepo.ler(ana.id)).preferencias?.equipe, [{ id: "p-beto", nome: "Beto Lima", email: "beto@alfa.adv.br", inativa: true }]);
});

test("estagiário não exclui intimações nem processos, e não muda a lista da equipe", opcoes, async () => {
  const ana = await escritorioDaAna();
  await servico.convidar(ana.id, { email: "eva@alfa.adv.br", papel: "estagiario" }, ctx);
  await servico.aceitarComContaNova(tokenDoUltimoEmail(), { nome: "Eva Prado", senha: "Cavalo-Trovao-Azul-91!", aceitouTermos: true }, ctx);
  const eva = (await usuariosRepo.porEmail("eva@alfa.adv.br"))!;
  const espacos = new EspacoTrabalhoService(espacosRepo, undefined, (id) => servico.papelDe(id));

  const atual = await espacos.carregar(eva.id);
  assert.equal(atual.papel, "estagiario");
  const e = await erro(espacos.salvar(eva.id, { intimacoes: [], termos: [], revisao: atual.revisao }));
  assert.equal(e.codigo, "sem_permissao");

  // Acrescentar pode; e a lista da equipe que ela mandar não vale: fica a gravada.
  const salvo = await espacos.salvar(eva.id, { intimacoes: [...atual.intimacoes, { id: "i2" }], termos: [], preferencias: { ...atual.preferencias, equipe: [] }, revisao: atual.revisao });
  assert.deepEqual(salvo.intimacoes.map((i) => i.id), ["i1", "i2"]);
  assert.equal(salvo.preferencias?.equipe?.length, 2);

  const processosSrv = new ProcessosService(new ProcessoRepositoryPostgres(banco.db), relogio, undefined, servico);
  const p = await processosSrv.criar(ana.id, { cliente: "Cliente X", polo: "ativo" });
  assert.equal((await erro(processosSrv.excluir(eva.id, p.id))).codigo, "sem_permissao");
  await processosSrv.excluir(ana.id, p.id);
});

test("processo particular: só quem o marcou vê, inclusive o que pende dele", opcoes, async () => {
  const ana = await escritorioDaAna();
  await servico.convidar(ana.id, { email: "beto@alfa.adv.br", papel: "advogado" }, ctx);
  await servico.aceitarComContaNova(tokenDoUltimoEmail(), { nome: "Beto Lima", senha: "Cavalo-Trovao-Azul-91!", aceitouTermos: true }, ctx);
  const beto = (await usuariosRepo.porEmail("beto@alfa.adv.br"))!;
  const repo = new ProcessoRepositoryPostgres(banco.db);
  const srv = new ProcessosService(repo, relogio, undefined, servico);

  const meu = await srv.criar(beto.id, { cliente: "Cliente do Beto", polo: "ativo", particular: true });
  const doEscritorio = await srv.criar(ana.id, { cliente: "Cliente do Escritório", polo: "passivo" });
  assert.deepEqual((await srv.listar(beto.id)).map((p) => p.cliente).sort(), ["Cliente do Beto", "Cliente do Escritório"]);
  assert.deepEqual((await srv.listar(ana.id)).map((p) => p.cliente), ["Cliente do Escritório"], "a dona não vê o particular");
  assert.equal(await repo.porId(ana.id, meu.id), null);
  assert.equal(await repo.excluir(ana.id, meu.id), false, "nem consegue apagar");

  const pareceres = new ParecerRepositoryPostgres(banco.db);
  await pareceres.criar(beto.id, { id: novoId(), processoId: meu.id, versao: 1, texto: "Parecer reservado", autorId: beto.id, autorNome: "Beto", criadoEm: relogio.agora().toISOString() });
  assert.equal((await pareceres.listar(ana.id, meu.id)).length, 0, "o parecer segue o processo");
  assert.equal((await pareceres.listar(beto.id, meu.id)).length, 1);

  // Tirar da vista do escritório um processo que é dele é decisão do dono.
  assert.equal((await erro(srv.atualizar(beto.id, doEscritorio.id, { ...doEscritorio, particular: true }))).codigo, "sem_permissao");
  // Devolver o particular ao escritório, qualquer dono do processo pode.
  await srv.atualizar(beto.id, meu.id, { cliente: "Cliente do Beto", polo: "ativo" });
  assert.equal((await srv.listar(ana.id)).length, 2);
  await srv.atualizar(ana.id, meu.id, { cliente: "Cliente do Beto", polo: "ativo", particular: true });
  assert.equal((await srv.listar(beto.id)).length, 1, "agora é particular da Ana");
});

test("processo particular: a Central de casos também esconde o fluxo e a trilha dele", opcoes, async () => {
  const ana = await escritorioDaAna();
  await servico.convidar(ana.id, { email: "beto@alfa.adv.br", papel: "advogado" }, ctx);
  await servico.aceitarComContaNova(tokenDoUltimoEmail(), { nome: "Beto Lima", senha: "Cavalo-Trovao-Azul-91!", aceitouTermos: true }, ctx);
  const beto = (await usuariosRepo.porEmail("beto@alfa.adv.br"))!;
  const processosRepo = new ProcessoRepositoryPostgres(banco.db);
  const srv = new ProcessosService(processosRepo, relogio, undefined, servico);
  const meu = await srv.criar(beto.id, { cliente: "Cliente do Beto", polo: "ativo", particular: true });

  const repo = new FluxoRepositoryPostgres(banco.db, (u, id) => processosRepo.porId(u, id));
  const fluxo = new FluxoService({ repo, processos: processosRepo, motor: motorPadrao, clock: relogio });
  await fluxo.marcarItem({ id: beto.id, nome: "Beto" }, meu.id, { item: "tri.documentos", feito: true, versao: 0 });
  assert.equal((await repo.listar(beto.id)).length, 1);
  assert.equal((await repo.eventos(beto.id, meu.id, 10)).length, 1);

  // Mesmo escritório, mas o processo é particular do Beto: o banco não entrega nada à Ana.
  assert.deepEqual(await repo.listar(ana.id), []);
  assert.equal(await repo.obter(ana.id, meu.id), null);
  assert.deepEqual(await repo.eventos(ana.id, meu.id, 10), []);
  assert.equal((await erro(fluxo.ficha(ana.id, meu.id))).codigo, "nao_encontrado");
});

test("ao excluir a conta, os processos particulares dela vão junto; os do escritório ficam", opcoes, async () => {
  const ana = await escritorioDaAna();
  await servico.convidar(ana.id, { email: "beto@alfa.adv.br", papel: "advogado" }, ctx);
  await servico.aceitarComContaNova(tokenDoUltimoEmail(), { nome: "Beto Lima", senha: "Cavalo-Trovao-Azul-91!", aceitouTermos: true }, ctx);
  const beto = (await usuariosRepo.porEmail("beto@alfa.adv.br"))!;
  const srv = new ProcessosService(new ProcessoRepositoryPostgres(banco.db), relogio, undefined, servico);
  await srv.criar(beto.id, { cliente: "Particular", polo: "ativo", particular: true });
  await srv.criar(beto.id, { cliente: "Do escritório", polo: "ativo" });

  await usuariosRepo.excluir(beto.id);
  // Superusuário dos testes enxerga tudo.
  assert.deepEqual((await banco.db.select({ cliente: processos.cliente }).from(processos)).map((p) => p.cliente), ["Do escritório"]);
  assert.deepEqual((await espacosRepo.ler(ana.id)).intimacoes.map((i) => i.id), ["i1"]);
});

test("a ronda passa uma vez só por escritório, mesmo com várias contas nele", opcoes, async () => {
  const ana = await escritorioDaAna();
  const atual = await espacosRepo.ler(ana.id);
  await espacosRepo.salvar(ana.id, { ...atual, termos: [{ id: "t1", apelido: "Dra. Ana", tipo: "oab", valor: "123456", ufOab: "SP", ativo: true, createdAt: "" }] }, atual.revisao);
  await servico.convidar(ana.id, { email: "beto@alfa.adv.br", papel: "advogado" }, ctx);
  await servico.aceitarComContaNova(tokenDoUltimoEmail(), { nome: "Beto Lima", senha: "Cavalo-Trovao-Azul-91!", aceitouTermos: true }, ctx);
  const beto = (await usuariosRepo.porEmail("beto@alfa.adv.br"))!;
  const solo = usuario("Solo Silva", "solo@beta.adv.br");
  await usuariosRepo.criar(solo);

  const gravacoes: string[] = [];
  const ronda = new RondaComunica({
    espacos: { ...espacosRepo, ler: (id) => espacosRepo.ler(id), excluir: (id) => espacosRepo.excluir(id), salvar: (id, d, r) => (gravacoes.push(id), espacosRepo.salvar(id, d, r)) },
    listarUsuarios: async () => [ana.id, beto.id, solo.id],
    escritorioDe: (id) => servico.escritorioDe(id),
    buscarPagina: async () => ({ total: 0, itens: [] }),
    clock: relogio,
    novoId,
  });
  const r = await ronda.todos();
  assert.equal(r.contas, 2, "o escritório da Ana e o do Solo");
  assert.deepEqual(gravacoes, [ana.id], "a busca dos clientes do escritório rodou uma vez, pela Ana");
});

test("registros das ferramentas de IA: do escritório para a equipe, pessoais e de processo particular só para quem pode", opcoes, async () => {
  const ana = await escritorioDaAna();
  await servico.convidar(ana.id, { email: "beto@alfa.adv.br", papel: "advogado" }, ctx);
  await servico.aceitarComContaNova(tokenDoUltimoEmail(), { nome: "Beto Lima", senha: "Cavalo-Trovao-Azul-91!", aceitouTermos: true }, ctx);
  const beto = (await usuariosRepo.porEmail("beto@alfa.adv.br"))!;
  const carlos = usuario("Carlos", "carlos@beta.adv.br");
  await usuariosRepo.criar(carlos);
  await espacosRepo.salvar(carlos.id, { intimacoes: [], termos: [] }, 0);
  const srv = new ProcessosService(new ProcessoRepositoryPostgres(banco.db), relogio, undefined, servico);
  const doEscritorio = await srv.criar(ana.id, { cliente: "Cliente", polo: "ativo" });
  const particular = await srv.criar(beto.id, { cliente: "Reservado", polo: "ativo", particular: true });
  const repo = new RegistrosRepositoryPostgres(banco.db);
  const agora = relogio.agora().toISOString();
  const reg = (tipo: "padrao" | "providencias", extra: { processoId?: string; donoId?: string } = {}) => ({ id: novoId(), tipo, valor: { x: 1 }, criadoEm: agora, atualizadoEm: agora, ...extra });

  const doEscritorioPadrao = reg("padrao");
  const pessoal = reg("padrao", { donoId: beto.id });
  await repo.gravar(ana.id, doEscritorioPadrao);
  await repo.gravar(beto.id, pessoal);
  assert.deepEqual((await repo.listar(beto.id, "padrao")).map((r) => r.id).sort(), [doEscritorioPadrao.id, pessoal.id].sort());
  assert.deepEqual((await repo.listar(ana.id, "padrao")).map((r) => r.id), [doEscritorioPadrao.id], "o pessoal do Beto não aparece para a dona");
  assert.equal(await repo.obter(ana.id, "padrao", pessoal.id), null);
  await assert.rejects(repo.gravar(ana.id, reg("padrao", { donoId: beto.id })), "ninguém grava registro pessoal em nome de outra pessoa");
  assert.deepEqual(await repo.listar(carlos.id, "padrao"), [], "outro escritório não vê nada");

  await repo.gravar(beto.id, reg("providencias", { processoId: particular.id }));
  await repo.gravar(ana.id, reg("providencias", { processoId: doEscritorio.id }));
  assert.equal((await repo.listar(beto.id, "providencias")).length, 2);
  assert.equal((await repo.listar(ana.id, "providencias")).length, 1, "o que pende do processo particular segue o processo");
  await assert.rejects(repo.gravar(ana.id, reg("providencias", { processoId: particular.id })));
  assert.equal(await repo.alterar(carlos.id, "padrao", doEscritorioPadrao.id, () => ({ y: 2 }), agora), null, "nem alterar de fora");

  await srv.excluir(beto.id, particular.id);
  assert.equal((await repo.listar(beto.id, "providencias")).length, 1, "excluir o processo apaga o que pendia dele");
});

test("fluxos de IA: publicado vale para a equipe, rascunho e execução só para quem criou", opcoes, async () => {
  const ana = await escritorioDaAna();
  await servico.convidar(ana.id, { email: "beto@alfa.adv.br", papel: "advogado" }, ctx);
  await servico.aceitarComContaNova(tokenDoUltimoEmail(), { nome: "Beto Lima", senha: "Cavalo-Trovao-Azul-91!", aceitouTermos: true }, ctx);
  const beto = (await usuariosRepo.porEmail("beto@alfa.adv.br"))!;
  const repo = new RegistrosRepositoryPostgres(banco.db);
  const ia = { modelo: "falso", perguntar: async () => ({ texto: "Pronto.", fontesWeb: [] }) };
  const fluxos = new FluxosIaService({
    repo,
    processos: new ProcessoRepositoryPostgres(banco.db),
    padroes: new PadroesService({ repo, clock: relogio }),
    contexto: undefined as never,
    revisoes: undefined as never,
    pesquisa: undefined as never,
    citacoes: undefined as never,
    biblioteca: undefined as never,
    ia,
    clock: relogio,
  });
  const passos = [{ ferramenta: "prompt", instrucao: "Escreva." }];
  const publicado = await fluxos.criar(ana, { titulo: "Do escritório", publicado: true, passos });
  const rascunho = await fluxos.criar(ana, { titulo: "Rascunho da Ana", passos });
  assert.deepEqual((await fluxos.listar(beto.id)).map((f) => f.id), [publicado.id]);
  assert.equal((await erro(fluxos.obter(beto.id, rascunho.id))).codigo, "nao_encontrado");

  const exec = await fluxos.iniciar(beto, publicado.id, {});
  const pronta = await fluxos.avancar(beto, exec.id);
  assert.equal(pronta.relatorio, "Pronto.");
  assert.deepEqual(await fluxos.listarExecucoes(ana.id), [], "a execução do Beto é só dele");
  assert.equal((await erro(fluxos.obterExecucao(ana.id, exec.id))).codigo, "nao_encontrado");
});
