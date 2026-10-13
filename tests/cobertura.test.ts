import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { type DiaCoberto, diasDaBusca, mesclarDia, type ResumoCobertura, resumirCobertura, seloDeVigilia } from "../lib/cobertura.ts";
import { type ConsultaComunica, conferirEco, type IntimacaoImportada } from "../lib/comunica.ts";
import type { TermoMonitorado } from "../lib/types.ts";
import type { Usuario } from "../server/auth/model.ts";
import { buscarEmJanelas, ErroComunica } from "../server/comunica/busca.ts";
import { novoId } from "../server/core/crypto.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { CoberturaRepositoryPostgres } from "../server/infra/postgres/cobertura.ts";
import { comEscritorio } from "../server/infra/postgres/contexto.ts";
import { UsuarioRepositoryPostgres } from "../server/infra/postgres/repositorios.ts";
import { registroCobertura } from "../server/infra/postgres/schema.ts";
import { CoberturaRepositoryDocumentos, CoberturaService } from "../server/rondas/cobertura.ts";
import { RondaComunica } from "../server/rondas/ronda-comunica.ts";
import { EspacoTrabalhoRepositoryDocumentos } from "../server/workspace/espaco-trabalho.ts";
import { type BancoDeTeste, criarBancoDeTeste, URL_TESTE } from "./apoio/postgres.ts";

const USUARIO = "11111111-1111-1111-1111-111111111111";
const AGORA = "2026-10-11T12:00:00.000Z";

const item = (dia: string, over: Partial<IntimacaoImportada> = {}): IntimacaoImportada => ({
  origem: "comunica",
  hash: `${dia}-${Math.random()}`,
  tribunal: "TJSP",
  orgao: "",
  dataDisponibilizacao: dia,
  tipoComunicacao: "Intimação",
  meio: "D",
  tipoDocumento: "",
  classe: "",
  numeroProcesso: "1000001-11.2026.8.26.0100",
  partes: [],
  advogados: [],
  texto: "Intime-se.",
  ...over,
});

const termo = (over: Partial<TermoMonitorado> = {}): TermoMonitorado => ({ id: "t1", apelido: "Dra. Ana", tipo: "oab", valor: "123456", ufOab: "SP", ativo: true, createdAt: "", ...over });

const dia = (d: string, estado: DiaCoberto["estado"], over: Partial<DiaCoberto> = {}): DiaCoberto => ({ termoId: "t1", dia: d, estado, lidos: 0, tentativas: 1, verificadoEm: AGORA, ...over });

test("cada dia do período ganha um estado conforme a janela que o cobriu", () => {
  const dias = diasDaBusca(
    "t1",
    { inicio: "2026-10-01", fim: "2026-10-06" },
    [
      { inicio: "2026-10-05", fim: "2026-10-06", estado: "completa", lidos: 1, ms: 120 },
      { inicio: "2026-10-03", fim: "2026-10-04", estado: "falhou", lidos: 0, ms: 40_000, erro: "Timeout" },
      { inicio: "2026-10-02", fim: "2026-10-02", estado: "parcial", lidos: 100, esperados: 230, ms: 900 },
    ],
    ["2026-10-06"],
    AGORA,
  );
  const porDia = Object.fromEntries(dias.map((d) => [d.dia, d]));
  assert.equal(porDia["2026-10-06"].estado, "VERIFICADO_COM_RESULTADOS");
  assert.equal(porDia["2026-10-06"].lidos, 1);
  assert.equal(porDia["2026-10-05"].estado, "VERIFICADO_SEM_RESULTADOS");
  assert.equal(porDia["2026-10-04"].estado, "FALHOU");
  assert.equal(porDia["2026-10-04"].erro, "Timeout");
  assert.equal(porDia["2026-10-02"].estado, "PARCIAL");
  assert.equal(porDia["2026-10-02"].esperados, 230, "esperados só em janela de um dia");
  assert.equal(porDia["2026-10-05"].esperados, undefined);
  assert.equal(porDia["2026-10-01"].estado, "NAO_VERIFICADO", "a busca não chegou a este dia");
});

test("falha geral marca como FALHOU os dias que nenhuma janela alcançou", () => {
  const dias = diasDaBusca("t1", { inicio: "2026-10-09", fim: "2026-10-11" }, [], [], AGORA, "O Comunica PJe respondeu com erro 403.");
  assert.equal(dias.length, 3);
  assert.ok(dias.every((d) => d.estado === "FALHOU" && /403/.test(d.erro ?? "")));
});

test("um dia já verificado não volta a ser lacuna quando a repetição falha", () => {
  const ok = dia("2026-10-10", "VERIFICADO_SEM_RESULTADOS");
  const falha = dia("2026-10-10", "FALHOU", { erro: "x" });
  assert.equal(mesclarDia(ok, falha).estado, "VERIFICADO_SEM_RESULTADOS");
  assert.equal(mesclarDia(ok, falha).tentativas, 2);
  assert.equal(mesclarDia(falha, ok).estado, "VERIFICADO_SEM_RESULTADOS", "lacuna reprocessada some");
  assert.equal(mesclarDia(undefined, falha).estado, "FALHOU");
});

const OP = { agora: new Date(AGORA), rondaLigada: true, intervaloHoras: 6 };
const comRonda = (em = "2026-10-11T10:00:00.000Z", erro?: string) => termo({ ultimaRonda: { em, ate: "2026-10-11", novas: 0, erro } });

test("lacunas: dias sem verificação do primeiro registro até a última ronda", () => {
  const r = resumirCobertura(
    [comRonda(), termo({ id: "t2", tipo: "parte", valor: "Fulano" })],
    [dia("2026-10-08", "VERIFICADO_SEM_RESULTADOS"), dia("2026-10-09", "FALHOU", { erro: "Timeout" }), dia("2026-10-11", "VERIFICADO_COM_RESULTADOS")],
    OP,
  );
  assert.equal(r.termos, 1, "só OAB e processo contam");
  assert.deepEqual(
    r.lacunas.map((l) => [l.dia, l.estado]),
    [
      ["2026-10-10", "NAO_VERIFICADO"],
      ["2026-10-09", "FALHOU"],
    ],
  );
  assert.equal(seloDeVigilia(r, OP.agora).tom, "atencao");
  assert.match(seloDeVigilia(r, OP.agora).texto, /2 dia\(s\) sem verificação/);
});

test("selo: só diz que está tudo certo com ronda recente e sem lacunas", () => {
  const base: ResumoCobertura = { rondaLigada: true, intervaloHoras: 6, termos: 1, ultimaRonda: "2026-10-11T11:30:00.000Z", lacunas: [] };
  assert.deepEqual(seloDeVigilia(base, OP.agora).tom, "ok");
  assert.equal(seloDeVigilia(base, OP.agora).texto, "Vigília ativa · última ronda há 30 min");
  const parada = seloDeVigilia({ ...base, ultimaRonda: "2026-10-10T20:00:00.000Z" }, OP.agora);
  assert.equal(parada.tom, "alerta");
  assert.match(parada.texto, /Vigília parada · última ronda há 16 h/);
  assert.equal(seloDeVigilia({ ...base, rondaLigada: false }, OP.agora).tom, "atencao");
  assert.equal(seloDeVigilia({ ...base, ultimaRonda: undefined }, OP.agora).tom, "neutro");
  assert.equal(seloDeVigilia({ ...base, termos: 0 }, OP.agora).tom, "neutro");
});

const CONSULTA: ConsultaComunica = { termo: { tipo: "processo", valor: "1000001-11.2026.8.26.0100", tribunal: "TJSP" }, dataInicio: "2026-10-01", dataFim: "2026-10-07" };

test("eco: a resposta precisa bater com processo, tribunal e período", () => {
  assert.equal(conferirEco(CONSULTA, { total: 1, itens: [item("2026-10-03")] }), null);
  assert.match(conferirEco(CONSULTA, { total: 1, itens: [item("2026-10-03", { numeroProcesso: "0000002-22.2025.8.26.0100" })] }) ?? "", /não é o consultado/);
  assert.match(conferirEco(CONSULTA, { total: 1, itens: [item("2026-10-03", { tribunal: "TJRJ" })] }) ?? "", /fora do tribunal/);
  assert.match(conferirEco(CONSULTA, { total: 1, itens: [item("2026-09-20")] }) ?? "", /fora do período/);
});

test("eco: parâmetro ignorado (count perto de 10.000) é recusado como consulta ampla demais", () => {
  const consulta: ConsultaComunica = { termo: { tipo: "oab", valor: "123456", ufOab: "SP" }, dataInicio: "2026-10-01", dataFim: "2026-10-07" };
  assert.match(conferirEco(consulta, { total: 10_000, itens: [] }) ?? "", /ampla demais/);
  assert.equal(conferirEco(consulta, { total: 312, itens: [] }), null);
});

test("a busca informa como terminou cada janela", async () => {
  const r = await buscarEmJanelas({ ...CONSULTA, dataInicio: "2026-09-25" }, async (c) => (c.dataFim === "2026-10-07" ? { total: 1, itens: [item("2026-10-03")] } : { total: 0, itens: [] }), {
    diasPorJanela: 7,
    maxItens: 500,
    orcamentoMs: 60_000,
  });
  assert.deepEqual(
    r.janelas.map((j) => [j.inicio, j.fim, j.estado, j.lidos]),
    [
      ["2026-10-01", "2026-10-07", "completa", 1],
      ["2026-09-25", "2026-09-30", "completa", 0],
    ],
  );
});

function montarRonda(buscar: (c: ConsultaComunica) => IntimacaoImportada[] | Error, agora: { valor: Date }) {
  const armazenamento = new ArmazenamentoEmMemoria();
  const clock = { agora: () => agora.valor };
  const espacos = new EspacoTrabalhoRepositoryDocumentos(armazenamento, clock);
  const cobertura = new CoberturaRepositoryDocumentos(armazenamento, clock);
  let n = 0;
  const ronda = new RondaComunica({
    espacos,
    listarUsuarios: async () => [USUARIO],
    buscarPagina: async (c) => {
      const r = buscar(c);
      if (r instanceof Error) throw r;
      return { total: r.length, itens: r };
    },
    clock,
    novoId: () => `n${++n}`,
    cobertura,
  });
  const servico = new CoberturaService({ repo: cobertura, espacos, clock, rondaLigada: true, intervaloHoras: 6 });
  return { espacos, ronda, servico };
}

test("aceite: falha simulada num dia vira lacuna visível e é reprocessada na ronda seguinte", async () => {
  const agora = { valor: new Date("2026-10-11T12:00:00Z") };
  let falhar = true;
  const { espacos, ronda, servico } = montarRonda((c) => {
    // O Comunica recusa só o dia 09/10 na primeira ronda.
    if (falhar && c.dataInicio <= "2026-10-09" && c.dataFim >= "2026-10-09") {
      if (c.dataInicio === c.dataFim) return new ErroComunica("O Comunica PJe respondeu com erro 403.", 502);
      const e = new Error("demorou");
      e.name = "TimeoutError";
      return e;
    }
    return c.dataInicio <= "2026-10-08" && c.dataFim >= "2026-10-08" ? [item("2026-10-08")] : [];
  }, agora);
  await espacos.salvar(USUARIO, { intimacoes: [], termos: [termo({ tipo: "processo", valor: "1000001-11.2026.8.26.0100" })] }, 0);

  await ronda.doUsuario(USUARIO);
  let r = await servico.resumo(USUARIO);
  assert.equal(r.lacunas.find((l) => l.dia === "2026-10-09")?.estado, "FALHOU", "o dia que falhou aparece como lacuna");
  assert.ok(!r.lacunas.some((l) => l.dia >= "2026-10-10"), "os dias lidos antes da falha estão verificados");
  assert.equal(seloDeVigilia(r, agora.valor).tom, "atencao");
  assert.equal((await espacos.ler(USUARIO)).intimacoes.length, 0, "a busca parou no dia que falhou");

  falhar = false;
  agora.valor = new Date("2026-10-11T18:00:00Z");
  await ronda.doUsuario(USUARIO);
  r = await servico.resumo(USUARIO);
  assert.deepEqual(r.lacunas, [], "a ronda seguinte verificou o dia que faltava");
  assert.equal(seloDeVigilia(r, agora.valor).tom, "ok");
  assert.equal((await espacos.ler(USUARIO)).intimacoes.length, 1, "sem duplicar");
});

test("ronda que falha por inteiro deixa todo o período como lacuna", async () => {
  const agora = { valor: new Date("2026-10-11T12:00:00Z") };
  const { espacos, ronda, servico } = montarRonda(() => new ErroComunica("O Comunica PJe respondeu com erro 403.", 502), agora);
  await espacos.salvar(USUARIO, { intimacoes: [], termos: [termo()] }, 0);
  await ronda.doUsuario(USUARIO);
  const r = await servico.resumo(USUARIO);
  assert.equal(r.lacunas.length, 8, "7 dias para trás mais hoje");
  assert.ok(r.lacunas.every((l) => l.estado === "FALHOU"));
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

test("cobertura no Postgres: mescla, isola por escritório e some com a conta", opcoes, async () => {
  await banco.limpar();
  const usuarios = new UsuarioRepositoryPostgres(banco.db);
  const ana = usuario("ana@x.com");
  const beto = usuario("beto@x.com");
  await usuarios.criar(ana);
  await usuarios.criar(beto);
  const repo = new CoberturaRepositoryPostgres(banco.db, { agora: () => new Date(AGORA) });

  await repo.registrar(ana.id, [dia("2026-10-10", "VERIFICADO_SEM_RESULTADOS"), dia("2026-10-09", "FALHOU", { erro: "Timeout" })]);
  await repo.registrar(ana.id, [dia("2026-10-10", "FALHOU", { erro: "x" }), dia("2026-10-09", "VERIFICADO_COM_RESULTADOS", { lidos: 2 })]);
  const lidos = Object.fromEntries((await repo.listar(ana.id, "2026-10-01")).map((d) => [d.dia, d]));
  assert.equal(lidos["2026-10-10"].estado, "VERIFICADO_SEM_RESULTADOS", "verificação anterior continua valendo");
  assert.equal(lidos["2026-10-10"].tentativas, 2);
  assert.equal(lidos["2026-10-09"].estado, "VERIFICADO_COM_RESULTADOS");
  assert.equal(lidos["2026-10-09"].lidos, 2);

  // Dias com mais de 90 dias são podados.
  await repo.registrar(ana.id, [dia("2026-06-01", "FALHOU")]);
  assert.equal((await repo.listar(ana.id, "2026-01-01")).length, 2);

  assert.deepEqual(await repo.listar(beto.id, "2026-01-01"), [], "o Beto não vê a cobertura da Ana");
  const vistas = await comEscritorio(banco.db, beto.id, (tx) => tx.select().from(registroCobertura));
  assert.equal(vistas.length, 0, "nem consultando a tabela direto");
  await comEscritorio(banco.db, beto.id, (tx) => tx.delete(registroCobertura).where(eq(registroCobertura.termoId, "t1")));
  assert.equal((await repo.listar(ana.id, "2026-01-01")).length, 2, "apagar pelo Beto não alcança a Ana");

  await usuarios.excluir(ana.id);
  await usuarios.excluir(beto.id);
  assert.equal((await banco.db.select().from(registroCobertura)).length, 0);
});
