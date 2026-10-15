import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import type { Usuario } from "../server/auth/model.ts";
import { novoId } from "../server/core/crypto.ts";
import { AppError } from "../server/core/errors.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { comEscritorio } from "../server/infra/postgres/contexto.ts";
import { MovimentacaoRepositoryPostgres } from "../server/infra/postgres/movimentacoes.ts";
import { ProcessoRepositoryPostgres } from "../server/infra/postgres/processos.ts";
import { UsuarioRepositoryPostgres } from "../server/infra/postgres/repositorios.ts";
import { processoMovimentacoes } from "../server/infra/postgres/schema.ts";
import { type ConsultarDataJud, criarConsultaDataJud, indiceDataJud, lerDataJud, lerResposta, type ResultadoDataJud } from "../server/processos/datajud.ts";
import { type MovimentacaoRepository, MovimentacaoRepositoryDocumentos, MovimentacoesService } from "../server/processos/movimentacoes.ts";
import { type ProcessoRepository, ProcessoRepositoryDocumentos, ProcessosService } from "../server/processos/processos.ts";
import { type BancoDeTeste, criarBancoDeTeste, URL_TESTE } from "./apoio/postgres.ts";

const erro = (codigo: string) => (e: unknown) => e instanceof AppError && e.codigo === codigo;
const codigoPg = (e: unknown) => (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;

/** Número CNJ válido com o segmento J.TR pedido (padrão: 8.26, TJSP). */
function cnj(sequencial: string, jtr = "826"): string {
  const base = `${sequencial.padStart(7, "0")}2024${jtr}0100`;
  let r = 0;
  for (const c of `${base}00`) r = (r * 10 + Number(c)) % 97;
  return `${base.slice(0, 7)}${String(98 - r).padStart(2, "0")}${base.slice(7)}`;
}

test("o tribunal do DataJud sai do número CNJ", () => {
  assert.equal(indiceDataJud(cnj("1", "826")), "tjsp");
  assert.equal(indiceDataJud(cnj("1", "807")), "tjdft");
  assert.equal(indiceDataJud(cnj("1", "819")), "tjrj");
  assert.equal(indiceDataJud(cnj("1", "502")), "trt2");
  assert.equal(indiceDataJud(cnj("1", "500")), "tst");
  assert.equal(indiceDataJud(cnj("1", "403")), "trf3");
  assert.equal(indiceDataJud(cnj("1", "626")), "tre-sp");
  assert.equal(indiceDataJud(cnj("1", "300")), "stj");
  assert.equal(indiceDataJud(cnj("1", "913")), "tjmmg");
  assert.equal(indiceDataJud(cnj("1", "100")), undefined, "STF não está no DataJud");
  assert.equal(indiceDataJud(cnj("1", "828")), undefined);
  assert.equal(indiceDataJud("123"), undefined);
});

test("datas do DataJud: ISO e o formato compacto na hora de Brasília", () => {
  assert.equal(lerDataJud("2024-05-10T14:23:00.000Z"), "2024-05-10T14:23:00.000Z");
  assert.equal(lerDataJud("20240510142300"), "2024-05-10T17:23:00.000Z");
  assert.equal(lerDataJud("ontem"), undefined);
  assert.equal(lerDataJud(undefined), undefined);
});

test("junta os registros de cada grau, sem repetidos, do mais novo para o mais antigo", () => {
  const r = lerResposta({
    hits: {
      hits: [
        {
          _source: {
            grau: "G1",
            dataHoraUltimaAtualizacao: "2024-06-01T10:00:00.000Z",
            movimentos: [
              { codigo: 26, nome: "Distribuição", dataHora: "2024-01-10T09:00:00.000Z" },
              { codigo: 51, nome: "Conclusão", dataHora: "20240301120000", complementosTabelados: [{ descricao: "tipo_de_conclusao", nome: "para despacho" }] },
              { codigo: 51, nome: "Conclusão", dataHora: "20240301120000" },
              { nome: "Sem data" },
            ],
          },
        },
        {
          _source: {
            grau: "G2",
            dataHoraUltimaAtualizacao: "2024-07-01T10:00:00.000Z",
            movimentos: [{ codigo: 22, nome: "Baixa Definitiva", dataHora: "2024-06-20T15:00:00.000Z", orgaoJulgador: { nomeOrgao: "3ª Câmara" } }],
          },
        },
      ],
    },
  });
  assert.equal(r.encontrado, true);
  assert.equal(r.atualizadoNoTribunal, "2024-07-01T10:00:00.000Z");
  assert.deepEqual(r.movimentos, [
    { dataHora: "2024-06-20T15:00:00.000Z", nome: "Baixa Definitiva", codigo: 22, grau: "G2", orgao: "3ª Câmara" },
    { dataHora: "2024-03-01T15:00:00.000Z", nome: "Conclusão", codigo: 51, complementos: ["tipo de conclusao: para despacho"], grau: "G1" },
    { dataHora: "2024-01-10T09:00:00.000Z", nome: "Distribuição", codigo: 26, grau: "G1" },
  ]);
  assert.deepEqual(lerResposta({ hits: { hits: [] } }), { encontrado: false, movimentos: [] });
});

test("consulta: índice do tribunal, chave pública e busca pelo número", async () => {
  let url = "";
  let init: RequestInit = {};
  const consultar = criarConsultaDataJud({
    base: "https://datajud.exemplo/",
    chave: "CHAVE",
    fetch: (async (u: string, i: RequestInit) => {
      url = u;
      init = i;
      return Response.json({ hits: { hits: [{ _source: { movimentos: [{ nome: "Distribuição", dataHora: "2024-01-10T09:00:00Z" }] } }] } });
    }) as typeof fetch,
  });
  const numero = cnj("77", "502");
  const r = await consultar(numero);
  assert.equal(url, "https://datajud.exemplo/api_publica_trt2/_search");
  assert.equal(new Headers(init.headers).get("authorization"), "APIKey CHAVE");
  assert.deepEqual(JSON.parse(String(init.body)).query, { match: { numeroProcesso: numero } });
  assert.equal(r.movimentos.length, 1);

  const recusa = criarConsultaDataJud({ base: "https://x", chave: "velha", fetch: (async () => new Response("", { status: 401 })) as unknown as typeof fetch });
  await assert.rejects(recusa(numero), /DATAJUD_API_KEY/);
  await assert.rejects(recusa(cnj("1", "100")), /não tem processos deste tribunal/);
});

/** DataJud falso: devolve o que estiver em `respostas[numero]` ou lança `falha`. */
function dataJudFalso() {
  const estado = { respostas: {} as Record<string, ResultadoDataJud>, falha: undefined as string | undefined, chamadas: [] as string[] };
  const consultar: ConsultarDataJud = async (numero) => {
    estado.chamadas.push(numero);
    if (estado.falha) throw new Error(estado.falha);
    return estado.respostas[numero] ?? { encontrado: false, movimentos: [] };
  };
  return { estado, consultar };
}

const mov = (dataHora: string, nome: string) => ({ dataHora, nome });

async function contrato(processosRepo: ProcessoRepository, repo: MovimentacaoRepository, ana: string, beto: string) {
  let agora = new Date("2026-10-13T12:00:00Z");
  const clock = { agora: () => agora };
  const { estado, consultar } = dataJudFalso();
  let limitadas = 0;
  const usuarios = [ana, beto];
  const servico = new MovimentacoesService({ repo, processos: processosRepo, consultar, clock, limitar: () => void limitadas++, listarUsuarios: async () => usuarios });
  const processos = new ProcessosService(processosRepo, clock, {
    caminhosDoProcesso: async () => [],
    aposExcluirProcesso: (u, id) => servico.excluirDoProcesso(u, id),
  });
  const p = await processos.criar(ana, { numero: cnj("101"), cliente: "Alfa", polo: "ativo" });
  const doBeto = await processos.criar(beto, { numero: cnj("202"), cliente: "Beta", polo: "passivo" });

  // Primeira consulta: tudo é da primeira vez, então nada conta como novo.
  estado.respostas[p.numero!] = { encontrado: true, atualizadoNoTribunal: "2026-10-10T00:00:00.000Z", movimentos: [mov("2026-10-01T10:00:00.000Z", "Distribuição")] };
  const r1 = await servico.atualizar(ana, p.id);
  assert.equal(r1.novos, 0);
  assert.deepEqual(await servico.obter(ana, p.id), r1.movimentacoes, "volta igual ao que foi gravado");
  assert.equal(limitadas, 1);

  // Segunda: um andamento novo.
  estado.respostas[p.numero!] = { encontrado: true, movimentos: [mov("2026-10-12T10:00:00.000Z", "Conclusão"), mov("2026-10-01T10:00:00.000Z", "Distribuição")] };
  const r2 = await servico.atualizar(ana, p.id);
  assert.equal(r2.novos, 1);
  assert.deepEqual(await servico.ultimas(ana), { [p.id]: { dataHora: "2026-10-12T10:00:00.000Z", nome: "Conclusão" } });

  // Falha: guarda o erro e mantém os andamentos que já tinha.
  estado.falha = "O DataJud demorou demais para responder.";
  const r3 = await servico.atualizar(ana, p.id);
  assert.equal(r3.movimentacoes.erro, "O DataJud demorou demais para responder.");
  assert.equal(r3.movimentacoes.movimentos.length, 2);
  estado.falha = undefined;

  // Beto não vê nem consulta o processo da Ana.
  await assert.rejects(servico.obter(beto, p.id), erro("nao_encontrado"));
  await assert.rejects(servico.atualizar(beto, p.id), erro("nao_encontrado"));
  assert.deepEqual(await servico.ultimas(beto), {});

  // Busca automática: o da Ana foi visto agora; só o do Beto é consultado.
  estado.chamadas.length = 0;
  assert.deepEqual(await servico.rodarTodos(), { consultados: 1, novos: 0, erros: 0 });
  assert.deepEqual(estado.chamadas, [doBeto.numero]);
  assert.equal((await servico.obter(beto, doBeto.id))?.encontrado, false);
  // Um dia depois, os dois de novo.
  agora = new Date("2026-10-14T13:00:00Z");
  estado.chamadas.length = 0;
  assert.equal((await servico.rodarTodos()).consultados, 2);

  // Tribunal fora do DataJud.
  const stf = await processos.criar(ana, { numero: cnj("303", "100"), cliente: "Gama", polo: "ativo" });
  await assert.rejects(servico.atualizar(ana, stf.id), erro("dados_invalidos"));

  // Excluir o processo apaga a consulta.
  await processos.excluir(ana, p.id);
  assert.equal(await repo.obter(ana, p.id), null);
  return { servico, processos };
}

test("andamentos em arquivo", async () => {
  const banco = new ArmazenamentoEmMemoria();
  const ana = novoId();
  const repo = new MovimentacaoRepositoryDocumentos(banco);
  const { servico, processos } = await contrato(new ProcessoRepositoryDocumentos(banco), repo, ana, novoId());
  const outro = await processos.criar(ana, { numero: cnj("404"), cliente: "Alfa", polo: "ativo" });
  await servico.atualizar(ana, outro.id);
  await servico.excluirDaConta(ana);
  assert.equal(await repo.obter(ana, outro.id), null);
});

test("duas consultas do mesmo processo ao mesmo tempo: a segunda é recusada", async () => {
  const banco = new ArmazenamentoEmMemoria();
  const ana = novoId();
  const processosRepo = new ProcessoRepositoryDocumentos(banco);
  let liberar!: () => void;
  const lenta: ConsultarDataJud = () => new Promise((ok) => (liberar = () => ok({ encontrado: false, movimentos: [] })));
  const relogio = { agora: () => new Date("2026-10-13T12:00:00Z") };
  const servico = new MovimentacoesService({ repo: new MovimentacaoRepositoryDocumentos(banco), processos: processosRepo, consultar: lenta, clock: relogio, listarUsuarios: async () => [] });
  const p = await new ProcessosService(processosRepo, relogio).criar(ana, { numero: cnj("505"), cliente: "Alfa", polo: "ativo" });
  const primeira = servico.atualizar(ana, p.id);
  await new Promise((ok) => setTimeout(ok, 20));
  await assert.rejects(servico.atualizar(ana, p.id), erro("conflito"));
  liberar();
  assert.equal((await primeira).movimentacoes.encontrado, false);
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

test("andamentos no Postgres: isolados por escritório e sem exclusão pelo app", opcoes, async () => {
  await banco.limpar();
  const usuarios = new UsuarioRepositoryPostgres(banco.db);
  const ana = usuario("ana@x.com");
  const beto = usuario("beto@x.com");
  await usuarios.criar(ana);
  await usuarios.criar(beto);
  const { servico, processos } = await contrato(new ProcessoRepositoryPostgres(banco.db), new MovimentacaoRepositoryPostgres(banco.db), ana.id, beto.id);

  const p = await processos.criar(ana.id, { numero: cnj("606"), cliente: "Alfa", polo: "ativo" });
  await servico.atualizar(ana.id, p.id);
  await assert.rejects(
    comEscritorio(banco.db, ana.id, (tx) => tx.delete(processoMovimentacoes).where(eq(processoMovimentacoes.processoId, p.id))),
    (e) => codigoPg(e) === "42501",
  );
  // O Beto, em outro escritório, não enxerga a linha nem pelo banco.
  const vistas = await comEscritorio(banco.db, beto.id, (tx) => tx.select().from(processoMovimentacoes));
  assert.equal(vistas.length, 1, "só a do próprio processo do Beto");
  assert.notEqual(vistas[0].processoId, p.id);

  await usuarios.excluir(ana.id);
  await usuarios.excluir(beto.id);
  assert.equal((await banco.db.select().from(processoMovimentacoes)).length, 0);
});
