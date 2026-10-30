import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import type { Usuario } from "../server/auth/model.ts";
import { AdministracaoService, DiretorioDeContasDocumentos } from "../server/admin/administracao.ts";
import { novoId } from "../server/core/crypto.ts";
import { AppError } from "../server/core/errors.ts";
import { IaClaude } from "../server/ia/ia.ts";
import {
  agruparPorEscritorio,
  comUsoIa,
  custoUsd,
  deUsoDaApi,
  funcaoDaRota,
  MedidorUsoIa,
  periodoDoMes,
  type RegistroUsoIa,
  type UsoIaRepository,
  UsoIaRepositoryDocumentos,
} from "../server/ia/uso.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { comEscritorio } from "../server/infra/postgres/contexto.ts";
import { EspacoTrabalhoRepositoryPostgres, UsuarioRepositoryPostgres } from "../server/infra/postgres/repositorios.ts";
import { membros, usoIa } from "../server/infra/postgres/schema.ts";
import { UsoIaRepositoryPostgres } from "../server/infra/postgres/uso-ia.ts";
import { AuditoriaDocumentos, SessaoRepositoryDocumentos, UsuarioRepositoryDocumentos } from "../server/infra/repositorios.ts";
import { type BancoDeTeste, criarBancoDeTeste, URL_TESTE } from "./apoio/postgres.ts";

const relogio = { agora: () => new Date("2026-10-30T15:00:00Z") };

function usuario(nome: string, email: string, extra: Partial<Usuario> = {}): Usuario {
  const agora = relogio.agora().toISOString();
  return {
    id: novoId(),
    nome,
    email,
    senhaHash: "scrypt$teste",
    totpAtivo: false,
    codigosRecuperacao: [],
    tentativasFalhas: 0,
    senhaAlteradaEm: agora,
    aceitouTermosEm: agora,
    criadoEm: agora,
    atualizadoEm: agora,
    ...extra,
  };
}

/** Repositório em memória que só guarda o que recebe. */
function repoFalso(falhar = false) {
  const gravados: RegistroUsoIa[] = [];
  const repo: UsoIaRepository = {
    registrar: async (r) => {
      if (falhar) throw new Error("banco fora do ar");
      gravados.push(r);
    },
    somarPorEscritorio: async () => [],
  };
  return { repo, gravados };
}

test("custo: tokens pelos preços do modelo, buscas à parte; modelo desconhecido fica sem custo", () => {
  const uso = { modelo: "claude-sonnet-5-5", entrada: 200_000, saida: 10_000, cacheEscrita: 0, cacheLeitura: 0, buscasWeb: 0 };
  assert.equal(custoUsd(uso), 0.5);
  assert.equal(custoUsd({ ...uso, entrada: 0, saida: 0, cacheLeitura: 1_000_000 }), 0.2);
  assert.equal(custoUsd({ ...uso, modelo: "claude-haiku-5-5", entrada: 2000, saida: 800 }), 0.0006);
  assert.equal(custoUsd({ ...uso, entrada: 0, saida: 0, buscasWeb: 3 }), 0.03);
  assert.equal(custoUsd({ ...uso, modelo: "modelo-novo" }), null);
});

test("uso da API: campos ausentes ou nulos viram zero", () => {
  assert.deepEqual(deUsoDaApi("resumo", "claude-haiku-5-5", { input_tokens: 12, output_tokens: 3, cache_creation_input_tokens: null, server_tool_use: { web_search_requests: 2 } }), {
    funcao: "resumo",
    modelo: "claude-haiku-5-5",
    entrada: 12,
    saida: 3,
    cacheEscrita: 0,
    cacheLeitura: 0,
    buscasWeb: 2,
  });
});

test("medidor: sem conta no contexto não grava; a função do cliente vale mais que a da rota", async () => {
  const { repo, gravados } = repoFalso();
  const { anotar } = new MedidorUsoIa({ repo, clock: relogio });
  await anotar("resumo", "claude-haiku-5-5", { input_tokens: 1, output_tokens: 1 });
  assert.equal(gravados.length, 0);

  const ana = novoId();
  await comUsoIa(ana, "revisoes", async () => {
    await anotar(undefined, "claude-sonnet-5-5", { input_tokens: 100, output_tokens: 50 });
    await anotar("parecer", "claude-sonnet-5-5", { input_tokens: 100, output_tokens: 50 });
    await anotar(undefined, "claude-sonnet-5-5", null);
    // Contexto dentro de contexto sem função herda a de fora.
    await comUsoIa(ana, undefined, () => anotar(undefined, "claude-sonnet-5-5", { input_tokens: 1 }));
  });
  assert.deepEqual(
    gravados.map((g) => [g.usuarioId, g.funcao]),
    [
      [ana, "revisoes"],
      [ana, "parecer"],
      [ana, "revisoes"],
    ],
  );
  assert.equal(gravados[0].em, "2026-10-30T15:00:00.000Z");
});

test("medidor: falha ao gravar não derruba a chamada de IA", async () => {
  const { repo } = repoFalso(true);
  const { anotar } = new MedidorUsoIa({ repo, clock: relogio });
  const erro = console.error;
  console.error = () => undefined;
  try {
    await comUsoIa(novoId(), "pesquisa", () => anotar(undefined, "claude-sonnet-5-5", { input_tokens: 1 }));
  } finally {
    console.error = erro;
  }
});

test("IaClaude anota o modelo que respondeu e os tokens da resposta", async () => {
  const sse = (dados: [string, unknown][]) => new Response(dados.map(([n, d]) => `event: ${n}\ndata: ${JSON.stringify(d)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
  const fetchFalso = (async () =>
    sse([
      ["message_start", { type: "message_start", message: { id: "m1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 0, cache_read_input_tokens: 300 } } }],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 40 } }],
      ["message_stop", { type: "message_stop" }],
    ])) as unknown as typeof fetch;
  const anotados: unknown[] = [];
  const ia = new IaClaude({ chave: "teste", modelo: "claude-sonnet-5-5", fetch: fetchFalso, anotarUso: async (f, m, u) => void anotados.push([f, m, u?.input_tokens, u?.output_tokens, u?.cache_read_input_tokens]) });
  assert.equal((await ia.perguntar({ sistema: "s", blocos: [{ tipo: "texto", texto: "oi" }] })).texto, "ok");
  assert.deepEqual(anotados, [[undefined, "claude-sonnet-5-5", 1200, 40, 300]]);
});

test("mês em Brasília: começa às 03:00 UTC do dia 1 e vira no mês seguinte", () => {
  assert.deepEqual(periodoDoMes("2026-12"), { desde: new Date("2026-12-01T03:00:00Z"), ate: new Date("2027-01-01T03:00:00Z") });
  assert.throws(() => periodoDoMes("2026-13"));
  assert.throws(() => periodoDoMes("outubro"));
});

test("agrupamento: um escritório por linha, do mais caro ao mais barato, com o detalhe por função", () => {
  const base = { cacheEscrita: 0, cacheLeitura: 0, buscasWeb: 0 };
  const grupos = agruparPorEscritorio([
    { escritorioId: "a", escritorio: "Alfa", funcao: "resumo", modelo: "claude-haiku-5-5", chamadas: 10, entrada: 20_000, saida: 8000, ...base },
    { escritorioId: "b", escritorio: "Beta", funcao: "analise_risco", modelo: "claude-sonnet-5-5", chamadas: 1, entrada: 200_000, saida: 10_000, ...base },
    { escritorioId: "a", escritorio: "Alfa", funcao: "x", modelo: "desconhecido", chamadas: 1, entrada: 1, saida: 1, ...base },
  ]);
  assert.deepEqual(grupos.map((g) => [g.escritorio, g.chamadas, g.semPreco]), [
    ["Beta", 1, false],
    ["Alfa", 11, true],
  ]);
  assert.equal(grupos[0].custoUsd, 0.5);
  assert.equal(grupos[1].porFuncao[0].funcao, "resumo");
});

test("documento: soma por conta no período e só para administrador", async () => {
  const arquivos = new ArmazenamentoEmMemoria();
  const usuarios = new UsuarioRepositoryDocumentos(arquivos);
  const admin = usuario("Thiago", "thiago@clepsa.com.br", { administrador: true });
  const ana = usuario("Ana", "ana@alfa.adv.br", { escritorio: "Alfa Advocacia" });
  await usuarios.criar(admin);
  await usuarios.criar(ana);
  const repo = new UsoIaRepositoryDocumentos({
    db: arquivos,
    clock: relogio,
    nomeDoEscritorio: async (id) => (await usuarios.porId(id))?.escritorio ?? "?",
    ehAdministrador: async (id) => !!(await usuarios.porId(id))?.administrador,
  });
  const linha = (em: string, funcao = "resumo"): RegistroUsoIa => ({ id: novoId(), usuarioId: ana.id, em, ...deUsoDaApi(funcao, "claude-haiku-5-5", { input_tokens: 1000, output_tokens: 100 }) });
  await repo.registrar(linha("2026-10-02T12:00:00Z"));
  await repo.registrar(linha("2026-10-20T12:00:00Z"));
  await repo.registrar(linha("2026-10-21T12:00:00Z", "parecer"));
  await repo.registrar(linha("2026-09-30T12:00:00Z"));

  const admin$ = new AdministracaoService({
    usuarios,
    sessoes: new SessaoRepositoryDocumentos(arquivos, relogio),
    auditoria: new AuditoriaDocumentos(arquivos, relogio),
    diretorio: new DiretorioDeContasDocumentos(arquivos),
    usoIa: repo,
    clock: relogio,
  });
  const r = await admin$.usoIa(admin.id, "2026-10");
  assert.equal(r.chamadas, 3);
  assert.equal(r.escritorios[0].escritorio, "Alfa Advocacia");
  assert.deepEqual(r.escritorios[0].porFuncao.map((f) => [f.funcao, f.chamadas, f.entrada]).sort(), [
    ["parecer", 1, 1000],
    ["resumo", 2, 2000],
  ]);
  assert.equal((await admin$.usoIa(admin.id, "")).mes, "2026-10");
  await assert.rejects(admin$.usoIa(ana.id, "2026-10"), (e) => e instanceof AppError && e.codigo === "sem_permissao");
  await assert.rejects(admin$.usoIa(admin.id, "2026-1"), (e) => e instanceof AppError && e.codigo === "dados_invalidos");
});

// ---- Postgres: grava no escritório certo e só o administrador lê todos ----

const opcoes = { skip: URL_TESTE ? false : "defina TEST_DATABASE_URL para rodar os testes no Postgres" };
let banco: BancoDeTeste;
let ana: Usuario;
let beto: Usuario;
let admin: Usuario;

before(async () => {
  if (!URL_TESTE) return;
  banco = await criarBancoDeTeste();
  const usuarios = new UsuarioRepositoryPostgres(banco.db);
  ana = usuario("Ana", "ana@alfa.adv.br");
  beto = usuario("Beto", "beto@beta.adv.br");
  admin = usuario("Thiago", "thiago@clepsa.com.br", { administrador: true });
  const espacos = new EspacoTrabalhoRepositoryPostgres(banco.db, relogio);
  for (const u of [ana, beto, admin]) {
    await usuarios.criar(u);
    await espacos.salvar(u.id, { intimacoes: [], termos: [] }, 0);
  }
});

after(async () => {
  await banco?.encerrar();
});

test("Postgres: cada uso cai no escritório de quem pediu; cada escritório só vê o seu", opcoes, async () => {
  const repo = new UsoIaRepositoryPostgres(banco.db);
  const linha = (u: Usuario, funcao: string, entrada: number): RegistroUsoIa => ({ id: novoId(), usuarioId: u.id, em: "2026-10-15T12:00:00Z", ...deUsoDaApi(funcao, "claude-sonnet-5-5", { input_tokens: entrada, output_tokens: 10 }) });
  await repo.registrar(linha(ana, "analise_risco", 200_000));
  await repo.registrar(linha(ana, "analise_risco", 100_000));
  await repo.registrar(linha(beto, "resumo", 1000));

  const [mAna] = await banco.db.select().from(membros).where(eq(membros.usuarioId, ana.id));
  await comEscritorio(banco.db, ana.id, async (tx) => {
    const linhas = await tx.select().from(usoIa);
    assert.equal(linhas.length, 2);
    assert.ok(linhas.every((l) => l.escritorioId === mAna.escritorioId));
  });

  const somas = await repo.somarPorEscritorio(admin.id, new Date("2026-10-01T03:00:00Z"), new Date("2026-11-01T03:00:00Z"));
  const daAna = somas.find((s) => s.escritorioId === mAna.escritorioId)!;
  assert.deepEqual([daAna.funcao, daAna.chamadas, daAna.entrada, daAna.saida], ["analise_risco", 2, 300_000, 20]);
  assert.equal(somas.length, 2);
  assert.deepEqual(await repo.somarPorEscritorio(admin.id, new Date("2026-11-01T03:00:00Z"), new Date("2026-12-01T03:00:00Z")), []);
  await assert.rejects(repo.somarPorEscritorio(ana.id, new Date(0), new Date()), (e) => e instanceof AppError && e.codigo === "sem_permissao");
});

test("Postgres: o app não altera nem apaga registros de uso", opcoes, async () => {
  await comEscritorio(banco.db, ana.id, async (tx) => {
    await assert.rejects(tx.update(usoIa).set({ entrada: 0 }));
  });
});

test("função pela rota: a área da API ou a ferramenta dentro do processo", () => {
  assert.equal(funcaoDaRota("/api/revisoes/abc"), "revisoes");
  assert.equal(funcaoDaRota("/api/processos/123/linha-do-tempo"), "linha-do-tempo");
  assert.equal(funcaoDaRota("/api/processos/123/pareceres/editor"), "editor");
  assert.equal(funcaoDaRota("/api/processos/123"), "processos");
  assert.equal(funcaoDaRota("/entrar"), undefined);
});
