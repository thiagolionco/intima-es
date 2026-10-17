import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { aplicar, agrupar, escreverFiltro, lerConsulta, montarLinhas, ordenar, resumoDaEsteira } from "../lib/fluxo/consulta.ts";
import { ETAPAS } from "../lib/fluxo/etapas.ts";
import { fluxoEfetivo, type FluxoProcesso } from "../lib/fluxo/modelo.ts";
import { MotorDeFluxo, motorPadrao } from "../lib/fluxo/motor.ts";
import { situacaoPrazo } from "../lib/fluxo/prazos.ts";
import type { Processo } from "../lib/processos.ts";
import type { Usuario } from "../server/auth/model.ts";
import { novoId } from "../server/core/crypto.ts";
import { AppError } from "../server/core/errors.ts";
import { type FluxoRepository, FluxoRepositoryDocumentos, FluxoService } from "../server/fluxo/fluxo.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { comEscritorio } from "../server/infra/postgres/contexto.ts";
import { FluxoRepositoryPostgres } from "../server/infra/postgres/fluxo.ts";
import { ProcessoRepositoryPostgres } from "../server/infra/postgres/processos.ts";
import { UsuarioRepositoryPostgres } from "../server/infra/postgres/repositorios.ts";
import { processoEventos, processoFluxo } from "../server/infra/postgres/schema.ts";
import { type ProcessoRepository, ProcessoRepositoryDocumentos, ProcessosService } from "../server/processos/processos.ts";
import { type BancoDeTeste, criarBancoDeTeste, URL_TESTE } from "./apoio/postgres.ts";

const HOJE = "2026-10-15";
const erro = (codigo: string) => (e: unknown) => e instanceof AppError && e.codigo === codigo;
const codigoPg = (e: unknown) => (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;

function cnj(sequencial: string): string {
  const base = `${sequencial.padStart(7, "0")}2024826` + "0100";
  let r = 0;
  for (const c of `${base}00`) r = (r * 10 + Number(c)) % 97;
  return `${base.slice(0, 7)}${String(98 - r).padStart(2, "0")}${base.slice(7)}`;
}

function processo(extra: Partial<Processo> = {}): Processo {
  return { id: novoId(), fase: "triagem", cliente: "Maria Souza", parteContraria: "Banco Pan", polo: "ativo", criadoEm: "2026-10-01T12:00:00.000Z", atualizadoEm: "2026-10-01T12:00:00.000Z", ...extra };
}

const vazio = (p: Processo): FluxoProcesso => fluxoEfetivo(p, undefined);
const marcados = (p: Processo, ids: string[]): FluxoProcesso => ({ ...vazio(p), checklist: Object.fromEntries(ids.map((i) => [i, { por: "x", porNome: "Ana", em: HOJE }])) });
const obrigatorios = (fase: Processo["fase"]) => ETAPAS.find((e) => e.id === fase)!.checklist.filter((i) => i.bloqueante && !i.automatico).map((i) => i.id);

test("motor: avançar exige checklist obrigatório, campos da etapa e um passo por vez", () => {
  const p = processo();
  const r = motorPadrao.avaliar({ processo: p, fluxo: vazio(p), para: "elaboracao", hoje: HOJE });
  assert.equal(r.permitido, false);
  assert.ok(r.bloqueios.some((b) => b.item === "tri.procuracao"));
  assert.ok(r.bloqueios.some((b) => b.campo === "area"));

  const pronto = processo({ area: "consumidor", tipo: "acao" });
  assert.equal(motorPadrao.avaliar({ processo: pronto, fluxo: marcados(pronto, obrigatorios("triagem")), para: "elaboracao", hoje: HOJE }).permitido, true);
  // Pular etapa não vale, mesmo com tudo feito.
  assert.equal(motorPadrao.avaliar({ processo: pronto, fluxo: marcados(pronto, obrigatorios("triagem")), para: "correcao", hoje: HOJE }).permitido, false);

  // Correção exige responsável; protocolo exige número CNJ válido e data.
  const ela = processo({ fase: "elaboracao", area: "civel", tipo: "acao" });
  const semResp = motorPadrao.avaliar({ processo: ela, fluxo: marcados(ela, obrigatorios("elaboracao")), para: "correcao", hoje: HOJE });
  assert.deepEqual(semResp.bloqueios.map((b) => b.campo), ["responsavelId"]);
  const cor = processo({ fase: "correcao", area: "civel", tipo: "acao", responsavelId: "p1", numero: "12345678901234567890" });
  const prot = motorPadrao.avaliar({ processo: cor, fluxo: marcados(cor, obrigatorios("correcao")), para: "protocolado", hoje: HOJE });
  assert.deepEqual(prot.bloqueios.map((b) => b.campo).sort(), ["dataProtocolo", "numero"]);
  const ok = { ...cor, numero: cnj("1"), dataProtocolo: HOJE };
  assert.equal(motorPadrao.avaliar({ processo: ok, fluxo: marcados(ok, obrigatorios("correcao")), para: "protocolado", hoje: HOJE }).permitido, true);
});

test("motor: voltar exige motivo; prescrição perto vira aviso, não bloqueio", () => {
  const p = processo({ fase: "correcao", prescricao: "2026-10-30" });
  assert.equal(motorPadrao.avaliar({ processo: p, fluxo: vazio(p), para: "elaboracao", motivo: "curto", hoje: HOJE }).permitido, false);
  const r = motorPadrao.avaliar({ processo: p, fluxo: vazio(p), para: "triagem", motivo: "Cliente trouxe documento novo", hoje: HOJE });
  assert.equal(r.permitido, true);
  assert.match(r.avisos[0].mensagem, /Prescreve em 15/);
  // As regras são plugáveis: um motor sem regras deixa tudo passar.
  assert.equal(new MotorDeFluxo([]).avaliar({ processo: p, fluxo: vazio(p), para: "protocolado", hoje: HOJE }).permitido, true);
});

test("prazo da etapa: atenção a partir de 70% e estourado depois do prazo", () => {
  assert.equal(situacaoPrazo("triagem", 3), "no_prazo");
  assert.equal(situacaoPrazo("triagem", 4), "atencao");
  assert.equal(situacaoPrazo("triagem", 6), "estourado");
  assert.equal(situacaoPrazo("protocolado", 900), "sem_prazo");
});

test("consulta: filtros digitados, negação, aspas e termos livres", () => {
  const c = lerConsulta('-etapa:protocolado resp:"ana lima" prescreve:<30 área:trab banco estado:xyz');
  assert.deepEqual(c.filtros.map(escreverFiltro), ["-etapa:protocolado", 'resp:"ana lima"', "prescreve:<30", "area:trabalhista"]);
  assert.deepEqual(c.termos, ["banco"]);
  assert.deepEqual(c.invalidos, ["estado:xyz"]);
  assert.equal(lerConsulta("etapa:ela").filtros[0].tipo === "etapa" && (lerConsulta("etapa:ela").filtros[0] as { valor: string }).valor, "elaboracao");

  const pessoas = [{ id: "p1", nome: "Ana Lima" }];
  const agora = new Date("2026-10-15T12:00:00Z");
  const a = processo({ responsavelId: "p1", prescricao: "2026-10-20", area: "trabalhista" });
  const b = processo({ cliente: "José", parteContraria: "Transportes", fase: "protocolado" });
  const linhas = montarLinhas([a, b], {}, motorPadrao, agora, HOJE);
  assert.deepEqual(aplicar(linhas, lerConsulta("resp:ana prescreve:<30"), pessoas).map((l) => l.processo.id), [a.id]);
  assert.deepEqual(aplicar(linhas, lerConsulta("-etapa:protocolado"), pessoas).map((l) => l.processo.id), [a.id]);
  assert.deepEqual(aplicar(linhas, lerConsulta("transportes"), pessoas).map((l) => l.processo.id), [b.id]);
  assert.deepEqual(aplicar(linhas, lerConsulta("resp:nenhum"), pessoas).map((l) => l.processo.id), [b.id]);
  assert.equal(linhas[0].diasNaEtapa, 14);
  assert.equal(linhas[0].prazo, "estourado");

  // Ordenar com vazios no fim, agrupar por etapa na ordem da esteira.
  const nome = (id: string) => pessoas.find((p) => p.id === id)?.nome;
  assert.deepEqual(ordenar(linhas, { coluna: "prescricao", direcao: "desc" }, nome).map((l) => l.processo.id), [a.id, b.id]);
  assert.deepEqual(agrupar(linhas, "etapa", nome).map((g) => g.chave), ["triagem", "protocolado"]);
  assert.equal(resumoDaEsteira(linhas)[0].estourados, 1);
});

/** Comportamento comum às duas implementações. */
async function contrato(processosRepo: ProcessoRepository, repo: FluxoRepository, ana: string, beto: string) {
  let instante = new Date("2026-10-15T12:00:00Z");
  const relogio = { agora: () => instante };
  const fluxo = new FluxoService({ repo, processos: processosRepo, motor: motorPadrao, clock: relogio });
  const processos = new ProcessosService(processosRepo, relogio, { caminhosDoProcesso: async () => [], aposExcluirProcesso: (u, p) => fluxo.excluirDoProcesso(u, p) });
  const autora = { id: ana, nome: "Ana Lima" };
  const p = await processos.criar(ana, { cliente: "Maria", polo: "ativo", area: "consumidor", tipo: "acao" });

  // Sem nada marcado, o servidor recusa o avanço com a lista do que falta.
  await assert.rejects(fluxo.transicionar(autora, p.id, { para: "elaboracao", versao: 0 }), (e) => erro("transicao_bloqueada")(e) && Array.isArray((e as AppError).detalhes?.bloqueios));

  let versao = 0;
  for (const item of obrigatorios("triagem")) {
    const r = await fluxo.marcarItem(autora, p.id, { item, feito: true, versao });
    versao = r.fluxo.versao;
  }
  // Versão velha na tela: recusa em vez de passar por cima.
  await assert.rejects(fluxo.marcarItem(autora, p.id, { item: "tri.documentos", feito: false, versao: 0 }), erro("conflito"));
  await assert.rejects(fluxo.marcarItem(autora, p.id, { item: "tri.prescricao", feito: true, versao }), erro("dados_invalidos"));
  await assert.rejects(fluxo.marcarItem(autora, p.id, { item: "ela.tese", feito: true, versao }), erro("dados_invalidos"));
  await assert.rejects(fluxo.marcarItem(autora, p.id, { item: "inventado", feito: true, versao }), erro("dados_invalidos"));

  instante = new Date("2026-10-16T09:00:00Z");
  const t = await fluxo.transicionar(autora, p.id, { para: "elaboracao", versao });
  assert.equal(t.processo.fase, "elaboracao");
  assert.equal(t.fluxo.etapaDesde, "2026-10-16T09:00:00.000Z");
  assert.equal((await processos.obter(ana, p.id)).fase, "elaboracao");

  // Voltar sem motivo não passa; com motivo fica na trilha.
  await assert.rejects(fluxo.transicionar(autora, p.id, { para: "triagem", versao: t.fluxo.versao }), erro("transicao_bloqueada"));
  instante = new Date("2026-10-16T10:00:00Z");
  const volta = await fluxo.transicionar(autora, p.id, { para: "triagem", motivo: "Faltou a procuração do cônjuge.", versao: t.fluxo.versao });
  const ficha = await fluxo.ficha(ana, p.id);
  assert.deepEqual(ficha.eventos.map((e) => e.tipo).slice(0, 2), ["retorno", "avanco"]);
  assert.equal(ficha.eventos[0].motivo, "Faltou a procuração do cônjuge.");
  assert.equal(ficha.eventos[0].autorNome, "Ana Lima");
  assert.equal(ficha.eventos.length, obrigatorios("triagem").length + 2);

  // Lote: um passa, outro fica com os motivos.
  const q = await processos.criar(ana, { cliente: "Pedro", polo: "ativo" });
  const lote = await fluxo.lote(autora, { acao: "avancar", ids: [p.id, q.id] });
  assert.deepEqual(lote.resultados.map((r) => r.ok), [true, false]);
  assert.ok(lote.resultados[1].bloqueios!.length >= 4);
  assert.equal(volta.processo.fase, "triagem");
  const atrib = await fluxo.lote(autora, { acao: "atribuir", ids: [q.id], responsavelId: "pessoa-1" });
  assert.equal(atrib.resultados[0].ok, true);
  assert.equal((await processos.obter(ana, q.id)).responsavelId, "pessoa-1");
  await assert.rejects(fluxo.lote(autora, { acao: "avancar", ids: Array.from({ length: 101 }, novoId) }), erro("dados_invalidos"));

  // Kanban e edição: a fase só muda pelas mesmas regras, e nada é salvo quando não pode.
  const comPortao = new ProcessosService(processosRepo, relogio, undefined, undefined, fluxo);
  const r = await processos.criar(ana, { cliente: "Rita", polo: "ativo", area: "consumidor", tipo: "acao" });
  await assert.rejects(comPortao.atualizar(ana, r.id, { ...r, fase: "correcao", observacoes: "pulou" }, "Ana Lima"), erro("transicao_bloqueada"));
  await assert.rejects(comPortao.atualizar(ana, r.id, { ...r, fase: "elaboracao", observacoes: "nova" }, "Ana Lima"), erro("transicao_bloqueada"));
  const intacto = await processos.obter(ana, r.id);
  assert.equal(intacto.fase, "triagem");
  assert.equal(intacto.observacoes, undefined, "recusada a etapa, o resto também não foi gravado");
  assert.equal((await comPortao.atualizar(ana, r.id, { ...r, observacoes: "nova" })).observacoes, "nova", "sem mudar a fase, grava normalmente");
  let vr = 0;
  for (const item of obrigatorios("triagem")) vr = (await fluxo.marcarItem(autora, r.id, { item, feito: true, versao: vr })).fluxo.versao;
  instante = new Date("2026-10-16T11:00:00Z");
  const avancado = await comPortao.atualizar(ana, r.id, { ...r, fase: "elaboracao" }, "Ana Lima");
  assert.equal(avancado.fase, "elaboracao");
  await assert.rejects(comPortao.atualizar(ana, r.id, { ...avancado, fase: "triagem" }, "Ana Lima"), erro("transicao_bloqueada"), "voltar sem motivo não passa");
  instante = new Date("2026-10-16T12:00:00Z");
  assert.equal((await comPortao.atualizar(ana, r.id, { ...avancado, fase: "triagem", motivo: "Cliente trouxe documento novo." }, "Ana Lima")).fase, "triagem");
  const trilha = (await fluxo.ficha(ana, r.id)).eventos;
  assert.deepEqual(trilha.slice(0, 2).map((e) => [e.tipo, e.autorNome]), [["retorno", "Ana Lima"], ["avanco", "Ana Lima"]]);
  assert.equal(trilha[0].motivo, "Cliente trouxe documento novo.");

  // Beto, de outro escritório, não vê nem mexe.
  const betoAutor = { id: beto, nome: "Beto" };
  await assert.rejects(fluxo.ficha(beto, p.id), erro("nao_encontrado"));
  await assert.rejects(fluxo.marcarItem(betoAutor, p.id, { item: "ela.tese", feito: true, versao: 0 }), erro("nao_encontrado"));
  assert.deepEqual((await fluxo.lote(betoAutor, { acao: "avancar", ids: [p.id] })).resultados[0].ok, false);
  assert.deepEqual((await fluxo.painel(beto)).processos, []);

  return { fluxo, processos, p };
}

test("central de casos em arquivo", async () => {
  const banco = new ArmazenamentoEmMemoria();
  const processosRepo = new ProcessoRepositoryDocumentos(banco);
  const repo = new FluxoRepositoryDocumentos(banco, processosRepo);
  const ana = novoId();
  const { fluxo, processos, p } = await contrato(processosRepo, repo, ana, novoId());
  await processos.excluir(ana, p.id);
  assert.equal(await repo.obter(ana, p.id), null);
  assert.deepEqual(await repo.eventos(ana, p.id, 10), []);
  await fluxo.excluirDaConta(ana);
  assert.deepEqual(await repo.listar(ana), []);
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

test("central de casos no Postgres: atômica, isolada e com trilha imutável", opcoes, async () => {
  await banco.limpar();
  const usuarios = new UsuarioRepositoryPostgres(banco.db);
  const ana = usuario("ana@x.com");
  const beto = usuario("beto@x.com");
  await usuarios.criar(ana);
  await usuarios.criar(beto);
  const processosRepo = new ProcessoRepositoryPostgres(banco.db);
  const { fluxo, processos, p } = await contrato(processosRepo, new FluxoRepositoryPostgres(banco.db, (u, id) => processosRepo.porId(u, id)), ana.id, beto.id);

  // A trilha não muda nem é apagada pelo papel do app.
  const [ev] = (await fluxo.ficha(ana.id, p.id)).eventos;
  await assert.rejects(comEscritorio(banco.db, ana.id, (tx) => tx.update(processoEventos).set({ motivo: "adulterado" }).where(eq(processoEventos.id, ev.id))), (e) => codigoPg(e) === "42501");
  await assert.rejects(comEscritorio(banco.db, ana.id, (tx) => tx.delete(processoEventos).where(eq(processoEventos.id, ev.id))), (e) => codigoPg(e) === "42501");

  // Duas marcações ao mesmo tempo sobre a mesma versão: uma entra, a outra recebe conflito.
  const q = await processos.criar(ana.id, { cliente: "Rita", polo: "ativo" });
  const corrida = await Promise.allSettled([
    fluxo.marcarItem({ id: ana.id, nome: "Ana" }, q.id, { item: "tri.documentos", feito: true, versao: 0 }),
    fluxo.marcarItem({ id: ana.id, nome: "Ana" }, q.id, { item: "tri.procuracao", feito: true, versao: 0 }),
  ]);
  assert.equal(corrida.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(corrida.some((r) => r.status === "rejected" && erro("conflito")(r.reason)));

  // Excluir o processo leva estado e trilha junto.
  await processos.excluir(ana.id, p.id);
  assert.equal((await banco.db.select().from(processoFluxo).where(eq(processoFluxo.processoId, p.id))).length, 0);
  assert.equal((await banco.db.select().from(processoEventos).where(eq(processoEventos.processoId, p.id))).length, 0);
  await usuarios.excluir(ana.id);
  await usuarios.excluir(beto.id);
});
