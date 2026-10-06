import { test } from "node:test";
import assert from "node:assert/strict";
import { chaveDeduplicacao, interpretarResposta, montarParametros, validarConsulta } from "../lib/comunica.ts";

// Exemplo no formato devolvido por https://comunicaapi.pje.jus.br/api/v1/comunicacao
const RESPOSTA = {
  status: "success",
  message: "Sucesso",
  count: 1,
  items: [
    {
      id: 123456789,
      data_disponibilizacao: "2026-10-01",
      siglaTribunal: "TJSP",
      tipoComunicacao: "Intimação",
      nomeOrgao: "5ª Vara Cível",
      texto: "Fica a parte intimada <br> para contestar.",
      numero_processo: "10012345620268260100",
      meio: "D",
      link: "https://esaj.tjsp.jus.br/doc",
      tipoDocumento: "Despacho",
      nomeClasse: "Procedimento Comum Cível",
      numeroComunicacao: 42,
      hash: "abc123",
      numeroprocessocommascara: "1001234-56.2026.8.26.0100",
      destinatarios: [
        { nome: "EMPRESA X LTDA", polo: "P", comunicacao_id: 123456789 },
        { nome: "FULANO DE TAL", polo: "A", comunicacao_id: 123456789 },
      ],
      destinatarioadvogados: [{ id: 1, advogado: { nome: "LUCAS MARTINS", numero_oab: "123456", uf_oab: "SP" } }],
    },
  ],
};

test("normaliza um item do Comunica", () => {
  const { total, itens } = interpretarResposta(RESPOSTA);
  assert.equal(total, 1);
  const i = itens[0];
  assert.equal(i.origem, "comunica");
  assert.equal(i.comunicaId, "123456789");
  assert.equal(i.tribunal, "TJSP");
  assert.equal(i.orgao, "5ª Vara Cível");
  assert.equal(i.dataDisponibilizacao, "2026-10-01");
  assert.equal(i.numeroProcesso, "1001234-56.2026.8.26.0100");
  assert.equal(i.classe, "Procedimento Comum Cível");
  assert.deepEqual(i.partes, [
    { nome: "EMPRESA X LTDA", polo: "P" },
    { nome: "FULANO DE TAL", polo: "A" },
  ]);
  assert.deepEqual(i.advogados, [{ nome: "LUCAS MARTINS", oab: "123456", uf: "SP" }]);
});

test("aceita data em formato brasileiro e campos ausentes", () => {
  const { itens } = interpretarResposta({ items: [{ datadisponibilizacao: "05/10/2026", texto: "x" }] });
  assert.equal(itens[0].dataDisponibilizacao, "2026-10-05");
  assert.equal(itens[0].tipoComunicacao, "Intimação");
  assert.deepEqual(itens[0].partes, []);
});

test("monta parâmetros por tipo de termo", () => {
  const p = montarParametros({ termo: { tipo: "oab", valor: "123.456", ufOab: "sp" }, dataInicio: "2026-10-01", dataFim: "2026-10-05" });
  assert.equal(p.get("numeroOab"), "123456");
  assert.equal(p.get("ufOab"), "SP");
  assert.equal(p.get("dataDisponibilizacaoInicio"), "2026-10-01");
  assert.equal(p.get("itensPorPagina"), "100");
  const q = montarParametros({ termo: { tipo: "parte", valor: " Empresa X ", tribunal: "tjsp" }, dataInicio: "2026-10-01", dataFim: "2026-10-05", pagina: 3 });
  assert.equal(q.get("nomeParte"), "Empresa X");
  assert.equal(q.get("siglaTribunal"), "TJSP");
  assert.equal(q.get("pagina"), "3");
});

test("valida consultas", () => {
  const base = { dataInicio: "2026-10-01", dataFim: "2026-10-05" };
  assert.equal(validarConsulta({ ...base, termo: { tipo: "parte", valor: "Empresa" } }), null);
  assert.match(validarConsulta({ ...base, termo: { tipo: "oab", valor: "123" } })!, /UF/);
  assert.match(validarConsulta({ ...base, termo: { tipo: "processo", valor: "123" } })!, /20 dígitos/);
  assert.match(validarConsulta({ dataInicio: "2026-10-09", dataFim: "2026-10-01", termo: { tipo: "parte", valor: "Empresa" } })!, /anterior/);
});

test("deduplica pela hash ou id", () => {
  const { itens } = interpretarResposta(RESPOSTA);
  assert.equal(chaveDeduplicacao(itens[0]), "h:abc123");
  assert.equal(chaveDeduplicacao({ ...itens[0], hash: undefined }), "c:123456789");
});
