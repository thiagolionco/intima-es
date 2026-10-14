import { test } from "node:test";
import assert from "node:assert/strict";
import type { ConsultaComunica, IntimacaoImportada } from "../lib/comunica.ts";
import type { TermoMonitorado } from "../lib/types.ts";
import { ErroComunica } from "../server/comunica/busca.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { hojeEmBrasilia, periodoDaRonda, RondaComunica, type NovaNaRonda } from "../server/rondas/ronda-comunica.ts";
import { EspacoTrabalhoRepositoryDocumentos } from "../server/workspace/espaco-trabalho.ts";

const USUARIO = "11111111-1111-1111-1111-111111111111";
// 11/10/2026 às 01h em Brasília = 04h UTC.
const clock = { agora: () => new Date("2026-10-11T04:00:00Z") };

const termo = (over: Partial<TermoMonitorado>): TermoMonitorado => ({ id: "t1", apelido: "Dra. Ana", tipo: "oab", valor: "123456", ufOab: "SP", ativo: true, createdAt: "", ...over });

const item = (hash: string): IntimacaoImportada => ({
  origem: "comunica",
  hash,
  tribunal: "TJSP",
  orgao: "5ª Vara Cível",
  dataDisponibilizacao: "2026-10-08",
  tipoComunicacao: "Intimação",
  meio: "D",
  tipoDocumento: "Despacho",
  classe: "Procedimento Comum Cível",
  numeroProcesso: "1000001-11.2026.8.26.0100",
  partes: [],
  advogados: [],
  texto: "Intime-se para contestar no prazo de 15 (quinze) dias.",
});

function montar(buscar: (c: ConsultaComunica) => IntimacaoImportada[] | Error) {
  const repo = new EspacoTrabalhoRepositoryDocumentos(new ArmazenamentoEmMemoria(), clock);
  const consultas: ConsultaComunica[] = [];
  const avisos: NovaNaRonda[] = [];
  let n = 0;
  const ronda = new RondaComunica({
    espacos: repo,
    listarUsuarios: async () => [USUARIO],
    buscarPagina: async (c) => {
      consultas.push(c);
      const r = buscar(c);
      if (r instanceof Error) throw r;
      return { total: r.length, itens: r };
    },
    clock,
    novoId: () => `n${++n}`,
    aoEncontrar: async (novas) => void avisos.push(...novas),
  });
  return { repo, ronda, consultas, avisos };
}

test("a data de hoje segue o fuso de Brasília", () => {
  assert.equal(hojeEmBrasilia(clock.agora()), "2026-10-11");
  assert.equal(hojeEmBrasilia(new Date("2026-10-11T02:59:00Z")), "2026-10-10");
});

test("período: 7 dias na primeira vez, depois repete o último dia, nunca mais que 30", () => {
  assert.deepEqual(periodoDaRonda({}, "2026-10-11"), { inicio: "2026-10-04", fim: "2026-10-11" });
  assert.deepEqual(periodoDaRonda({ ultimaRonda: { em: "", ate: "2026-10-10", novas: 0 } }, "2026-10-11"), { inicio: "2026-10-09", fim: "2026-10-11" });
  assert.deepEqual(periodoDaRonda({ ultimaRonda: { em: "", ate: "2026-01-01", novas: 0 } }, "2026-10-11"), { inicio: "2026-09-11", fim: "2026-10-11" });
});

test("procura só OAB e processo ativos, importa sem duplicar e avisa as novas", async () => {
  const { repo, ronda, consultas, avisos } = montar(() => [item("a"), item("b")]);
  await repo.salvar(USUARIO, { intimacoes: [], termos: [termo({}), termo({ id: "t2", tipo: "parte", valor: "Fulano" }), termo({ id: "t3", tipo: "processo", valor: "1".repeat(20), ativo: false })] }, 0);

  const r1 = await ronda.doUsuario(USUARIO);
  assert.deepEqual(r1, [{ termoId: "t1", apelido: "Dra. Ana", novas: 2, erro: undefined }]);
  assert.equal(consultas.length, 2, "uma janela de 7 dias e outra de 1 dia, só para o termo de OAB");
  assert.ok(consultas.every((c) => c.termo.tipo === "oab"));

  let espaco = await repo.ler(USUARIO);
  assert.equal(espaco.intimacoes.length, 2);
  assert.equal(espaco.intimacoes[0].cliente, "Dra. Ana");
  assert.equal(espaco.intimacoes[0].prazo, "2026-11-03", "prazo já calculado");
  assert.equal(espaco.termos[0].ultimaRonda?.ate, "2026-10-11");
  assert.equal(avisos.length, 2);

  await ronda.doUsuario(USUARIO);
  espaco = await repo.ler(USUARIO);
  assert.equal(espaco.intimacoes.length, 2, "a segunda ronda não duplica");
  assert.equal(espaco.termos[0].ultimaRonda?.novas, 0);
  assert.equal(avisos.length, 2);
});

test("falha no Comunica fica registrada no termo sem avançar a data", async () => {
  const { repo, ronda } = montar(() => new ErroComunica("O Comunica PJe respondeu com erro 403.", 502));
  await repo.salvar(USUARIO, { intimacoes: [], termos: [termo({ ultimaRonda: { em: "", ate: "2026-10-09", novas: 1 } })] }, 0);
  const [r] = await ronda.doUsuario(USUARIO);
  assert.match(r.erro ?? "", /403/);
  const t = (await repo.ler(USUARIO)).termos[0];
  assert.equal(t.ultimaRonda?.ate, "2026-10-09");
  assert.match(t.ultimaRonda?.erro ?? "", /403/);
});

test("se alguém gravar durante a busca, relê e grava por cima sem perder nada", async () => {
  let repoRef: EspacoTrabalhoRepositoryDocumentos | undefined;
  let mexeu = false;
  const { repo, ronda } = montar(() => {
    if (!mexeu && repoRef) {
      mexeu = true;
      // Simula a tela gravando uma intimação manual no meio da ronda.
      void repoRef.ler(USUARIO).then((e) => repoRef!.salvar(USUARIO, { intimacoes: [{ id: "manual" } as never, ...e.intimacoes], termos: e.termos }, e.revisao));
    }
    return [item("a")];
  });
  repoRef = repo;
  await repo.salvar(USUARIO, { intimacoes: [], termos: [termo({})] }, 0);
  await ronda.doUsuario(USUARIO);
  const ids = (await repo.ler(USUARIO)).intimacoes.map((i) => i.id);
  assert.ok(ids.includes("manual"));
  assert.equal(ids.length, 2);
});

test("saúde: ronda recente está bem, passou o dobro do intervalo está atrasada, sem termos não alarma", async () => {
  const { repo, ronda } = montar(() => []);
  assert.deepEqual(await ronda.saude(6), { contas: 1, termos: 0, ultimaRonda: undefined, atrasada: false });

  // clock = 11/10 04:00 UTC. 1 h atrás: ok.
  await repo.salvar(USUARIO, { intimacoes: [], termos: [termo({ ultimaRonda: { em: "2026-10-11T03:00:00Z", ate: "2026-10-11", novas: 0 } })] }, 0);
  const ok = await ronda.saude(6);
  assert.equal(ok.atrasada, false);
  assert.equal(ok.termos, 1);

  // 13 h atrás (mais que 2 × 6 h): atrasada.
  const e = await repo.ler(USUARIO);
  await repo.salvar(USUARIO, { intimacoes: [], termos: [termo({ ultimaRonda: { em: "2026-10-10T15:00:00Z", ate: "2026-10-10", novas: 0 } })] }, e.revisao);
  assert.equal((await ronda.saude(6)).atrasada, true);

  // Nunca rodou: ainda não dá para dizer que parou.
  const e2 = await repo.ler(USUARIO);
  await repo.salvar(USUARIO, { intimacoes: [], termos: [termo({})] }, e2.revisao);
  assert.equal((await ronda.saude(6)).atrasada, false);
});
