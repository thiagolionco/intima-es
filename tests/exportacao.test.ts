import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { montarTabela, PRESETS } from "../lib/exportacao/colunas.ts";
import { formatoCsv, formatoJson, gerarRelatorioHtml, gerarXlsx, nomeArquivoSeguro, tabelaParaTsv } from "../lib/exportacao/formatos.ts";
import { crc32 } from "../lib/exportacao/zip.ts";
import type { Intimacao } from "../lib/types.ts";

function intimacao(over: Partial<Intimacao> = {}): Intimacao {
  return {
    id: "1",
    origem: "comunica",
    cliente: "Construtora Alfa",
    tribunal: "TJSP",
    orgao: "1ª Vara Cível",
    dataDisponibilizacao: "2026-09-10",
    tipoComunicacao: "Intimação",
    meio: "D",
    tipoDocumento: "Despacho",
    classe: "Procedimento Comum",
    numeroProcesso: "0000001-00.2026.8.26.0100",
    partes: [{ nome: "João; da \"Silva\"", polo: "A" }],
    advogados: [{ nome: "Maria", oab: "123", uf: "SP" }],
    texto: "x".repeat(800),
    status: "em_analise",
    prazo: "2026-10-01",
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

const CTX = { titulo: "Intimações <teste>", metadados: ["Ana & Cia"], incluirCabecalho: true, separadorCsv: ";" as const, bomUtf8: true };

test("tabela respeita colunas escolhidas, ordem e formatação de datas", () => {
  const t = montarTabela([intimacao()], ["prazo", "cliente", "data"], { formatoData: "iso", textoCompleto: false, limiteTexto: 500 });
  assert.deepEqual(t.cabecalho, ["Prazo", "Cliente", "Data de disponibilização"]);
  assert.deepEqual(t.linhas[0], ["2026-10-01", "Construtora Alfa", "2026-09-10"]);
  const br = montarTabela([intimacao()], ["data", "status", "texto"]);
  assert.equal(br.linhas[0][0], "10/09/2026");
  assert.equal(br.linhas[0][1], "Em análise");
  assert.equal(br.linhas[0][2].length, 501, "texto resumido com reticências");
});

test("CSV escapa separador e aspas, com BOM opcional", () => {
  const t = montarTabela([intimacao()], ["partes", "cliente"]);
  const csv = formatoCsv.gerar(t, CTX) as string;
  assert.ok(csv.startsWith("﻿Partes;Cliente\r\n"));
  assert.ok(csv.includes('"João; da ""Silva"" (A)";Construtora Alfa'));
  const semBom = formatoCsv.gerar(t, { ...CTX, bomUtf8: false, separadorCsv: ",", incluirCabecalho: false }) as string;
  assert.equal(semBom, '"João; da ""Silva"" (A)",Construtora Alfa', "aspas sempre forçam o escape");
  const simples = formatoCsv.gerar(montarTabela([intimacao({ partes: [{ nome: "João; Silva", polo: "" }] })], ["partes"]), { ...CTX, bomUtf8: false, separadorCsv: ",", incluirCabecalho: false });
  assert.equal(simples, "João; Silva", "ponto e vírgula não precisa de aspas quando o separador é vírgula");
});

test("JSON usa os rótulos das colunas como chaves", () => {
  const t = montarTabela([intimacao()], PRESETS[0].colunas);
  const j = JSON.parse(formatoJson.gerar(t, CTX) as string);
  assert.equal(j.total, 1);
  assert.equal(j.registros[0]["Cliente"], "Construtora Alfa");
});

test("relatório para PDF escapa HTML", () => {
  const html = gerarRelatorioHtml(montarTabela([intimacao({ cliente: "<script>x</script>" })], ["cliente"]), CTX);
  assert.ok(html.includes("&lt;script&gt;x&lt;/script&gt;"));
  assert.ok(html.includes("Intimações &lt;teste&gt;"));
});

test("CRC32 confere com o valor de referência", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("XLSX é um ZIP válido que o unzip consegue ler", () => {
  const t = montarTabela([intimacao(), intimacao({ id: "2", cliente: "Beta & Filhos" })], PRESETS[2].colunas);
  const bytes = gerarXlsx(t, { titulo: "Intimações", incluirCabecalho: true });
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const dir = mkdtempSync(path.join(tmpdir(), "xlsx-"));
  const arquivo = path.join(dir, "t.xlsx");
  writeFileSync(arquivo, bytes);
  try {
    execFileSync("unzip", ["-tq", arquivo]);
    const sheet = execFileSync("unzip", ["-p", arquivo, "xl/worksheets/sheet1.xml"]).toString();
    assert.ok(sheet.includes("Beta &amp; Filhos"));
    assert.ok(sheet.includes('state="frozen"'));
    assert.ok(sheet.includes("<autoFilter"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return; // unzip não instalado
    throw e;
  }
});

test("TSV para colar e nome de arquivo seguro", () => {
  const t = montarTabela([intimacao({ observacoes: "linha1\nlinha2\tx" })], ["observacoes"]);
  assert.equal(tabelaParaTsv(t), "Observações\nlinha1 linha2 x");
  assert.equal(nomeArquivoSeguro("Relatório: prazos/outubro?", "xlsx"), "Relatorio-prazos-outubro.xlsx");
  assert.equal(nomeArquivoSeguro("dados.csv", "csv"), "dados.csv");
  assert.equal(nomeArquivoSeguro("", "json"), "intimacoes.json");
});
