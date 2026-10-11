import { test } from "node:test";
import assert from "node:assert/strict";
import type { Intimacao } from "../lib/types.ts";
import { AppError } from "../server/core/errors.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { normalizarResumo, type Resumidor } from "../server/resumos/resumidor.ts";
import { ResumosService } from "../server/resumos/resumos.ts";
import { EspacoTrabalhoRepositoryDocumentos } from "../server/workspace/espaco-trabalho.ts";

const USUARIO = "33333333-3333-3333-3333-333333333333";

function intimacao(over: Partial<Intimacao>): Intimacao {
  return {
    id: "i1", origem: "comunica", cliente: "Construtora Alfa", tribunal: "TJSP", orgao: "5ª Vara Cível", dataDisponibilizacao: "2026-10-08",
    tipoComunicacao: "Intimação", meio: "D", tipoDocumento: "Despacho", classe: "", numeroProcesso: "1000001-11.2026.8.26.0100",
    partes: [], advogados: [], texto: "Intime-se a ré para contestar em 15 dias.", status: "nova", createdAt: "", updatedAt: "", ...over,
  };
}

test("normaliza a resposta em duas linhas sem marcadores", () => {
  assert.equal(normalizarResumo("- Juiz recebeu a inicial.\n\n2. Contestar em 15 dias úteis.\nLinha extra"), "Juiz recebeu a inicial.\nContestar em 15 dias úteis.");
  assert.equal(normalizarResumo("   \n"), "");
  assert.equal(normalizarResumo("x".repeat(300)).length, 180);
});

function montar(resumidor?: Resumidor) {
  const clock = { agora: () => new Date("2026-10-11T12:00:00Z") };
  const espacos = new EspacoTrabalhoRepositoryDocumentos(new ArmazenamentoEmMemoria(), clock);
  return { espacos, servico: new ResumosService({ espacos, resumidor, clock }) };
}

test("sem resumidor configurado o serviço fica indisponível", async () => {
  const { servico } = montar();
  assert.equal(servico.disponivel, false);
  await assert.rejects(servico.resumir(USUARIO), (e: unknown) => e instanceof AppError && e.codigo === "indisponivel");
});

test("resume só o que não tem resumo, grava e sobrevive a uma gravação concorrente", async () => {
  const pedidos: string[] = [];
  let espacosRef: EspacoTrabalhoRepositoryDocumentos | undefined;
  const resumidor: Resumidor = {
    nome: "falso",
    async resumir(i) {
      pedidos.push(i.texto);
      if (i.texto === "falha") throw new Error("fora do ar");
      // Outra escrita chega enquanto o resumo é gerado: o serviço precisa tentar de novo.
      if (pedidos.length === 1) {
        const atual = await espacosRef!.ler(USUARIO);
        await espacosRef!.salvar(USUARIO, { intimacoes: [...atual.intimacoes, intimacao({ id: "i9", texto: "nova" })], termos: atual.termos }, atual.revisao);
      }
      return `Resumo de ${i.texto}\nSem providência: apenas ciência.`;
    },
  };
  const { espacos, servico } = montar(resumidor);
  espacosRef = espacos;
  await espacos.salvar(USUARIO, {
    intimacoes: [intimacao({}), intimacao({ id: "i2", resumo: { texto: "já tem", em: "x" } }), intimacao({ id: "i3", texto: "falha" }), intimacao({ id: "i4", texto: "" })],
    termos: [],
  }, 0);

  const r = await servico.resumir(USUARIO, ["i1", "i2", "i3", "i4"]);
  assert.deepEqual(Object.keys(r.resumos), ["i1"]);
  assert.equal(r.falhas, 1);
  assert.equal(pedidos.length, 2, "não pede resumo do que já tem nem de texto vazio");

  const salvo = await espacos.ler(USUARIO);
  assert.equal(salvo.intimacoes.find((i) => i.id === "i1")?.resumo?.texto, "Resumo de Intime-se a ré para contestar em 15 dias.\nSem providência: apenas ciência.");
  assert.ok(salvo.intimacoes.some((i) => i.id === "i9"), "a gravação concorrente não se perdeu");
  assert.equal(salvo.intimacoes.find((i) => i.id === "i2")?.resumo?.texto, "já tem");
});

test("descarta o resumo se o texto mudou enquanto era gerado", async () => {
  let espacosRef: EspacoTrabalhoRepositoryDocumentos | undefined;
  const { espacos, servico } = montar({
    nome: "falso",
    async resumir() {
      const atual = await espacosRef!.ler(USUARIO);
      await espacosRef!.salvar(USUARIO, { intimacoes: [intimacao({ texto: "corrigido" })], termos: [] }, atual.revisao);
      return "a\nb";
    },
  });
  espacosRef = espacos;
  await espacos.salvar(USUARIO, { intimacoes: [intimacao({})], termos: [] }, 0);
  const r = await servico.resumir(USUARIO);
  assert.deepEqual(r.resumos, {});
  assert.equal((await espacos.ler(USUARIO)).intimacoes[0].resumo, undefined);
});
