import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { filtrarItens, type ItemBiblioteca, limparEtiquetas, pesquisaNoTribunal, sugerirParaProcesso, validarItem } from "../lib/biblioteca.ts";
import { crc32, criarZip } from "../lib/exportacao/zip.ts";
import type { Usuario } from "../server/auth/model.ts";
import { type BibliotecaRepository, BibliotecaRepositoryDocumentos, BibliotecaService } from "../server/biblioteca/biblioteca.ts";
import { textoDoDocx } from "../server/biblioteca/docx.ts";
import { novoId } from "../server/core/crypto.ts";
import { AppError } from "../server/core/errors.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { ArquivosEmMemoria } from "../server/infra/arquivos.ts";
import { BibliotecaRepositoryPostgres } from "../server/infra/postgres/biblioteca.ts";
import { UsuarioRepositoryPostgres } from "../server/infra/postgres/repositorios.ts";
import { bibliotecaItens } from "../server/infra/postgres/schema.ts";
import { type BancoDeTeste, criarBancoDeTeste, URL_TESTE } from "./apoio/postgres.ts";

const relogio = { agora: () => new Date("2026-10-26T12:00:00Z") };
const pdf = (texto: string) => new TextEncoder().encode(`%PDF-1.7\n${texto}\n%%EOF`);
const erro = (codigo: string) => (e: unknown) => e instanceof AppError && e.codigo === codigo;

const XML_WORD = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="x"><w:body>
<w:p><w:r><w:t>EXCELENTÍSSIMO SENHOR JUIZ</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Autor: </w:t></w:r><w:r><w:t>[NOME] &amp; outros</w:t></w:r><w:r><w:tab/><w:t>&#x2014; fim</w:t></w:r></w:p>
</w:body></w:document>`;

/** ZIP com uma entrada comprimida (deflate), como o Word grava. */
function zipDeflate(nome: string, conteudo: string): Uint8Array {
  const dados = Buffer.from(conteudo, "utf8");
  const comp = deflateRawSync(dados);
  const n = Buffer.from(nome, "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc32(dados), 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(dados.length, 22);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc32(dados), 16);
  central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(dados.length, 24);
  central.writeUInt16LE(n.length, 28);
  central.writeUInt32LE(0, 42);
  const inicioCentral = local.length + n.length + comp.length;
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(1, 8);
  fim.writeUInt16LE(1, 10);
  fim.writeUInt32LE(central.length + n.length, 12);
  fim.writeUInt32LE(inicioCentral, 16);
  return new Uint8Array(Buffer.concat([local, n, comp, central, n, fim]));
}

const docx = (xml = XML_WORD) => criarZip([{ nome: "[Content_Types].xml", conteudo: "<Types/>" }, { nome: "word/document.xml", conteudo: xml }]);

test("texto do Word: um parágrafo por linha, entidades decodificadas, com ou sem compressão", () => {
  const esperado = "EXCELENTÍSSIMO SENHOR JUIZ\nAutor: [NOME] & outros\t— fim";
  assert.equal(textoDoDocx(docx()), esperado);
  assert.equal(textoDoDocx(zipDeflate("word/document.xml", XML_WORD)), esperado);
  assert.equal(textoDoDocx(pdf("x")), null);
  assert.equal(textoDoDocx(criarZip([{ nome: "outro.txt", conteudo: "x" }])), null, "zip sem word/document.xml não é Word");
  assert.equal(textoDoDocx(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])), null, "zip quebrado não derruba");
});

test("validação e etiquetas", () => {
  assert.deepEqual(limparEtiquetas(" dano moral, #Negativação ,Dano Moral,, negativação "), ["dano moral", "Negativação"]);
  assert.deepEqual(validarItem({ tipo: "sumula", titulo: "Súmula 385", texto: "Da anotação irregular…" }, false), {});
  const e = validarItem({ tipo: "xyz", titulo: " ", link: "javascript:alert(1)", area: "marte" }, false);
  assert.deepEqual(Object.keys(e).sort(), ["area", "link", "texto", "tipo", "titulo"]);
  assert.deepEqual(validarItem({ tipo: "modelo", titulo: "Inicial" }, true), {}, "com arquivo, o texto é opcional");
  assert.ok(validarItem({ tipo: "modelo", titulo: "x", texto: "y", etiquetas: Array.from({ length: 11 }, (_, i) => `e${i}`) }, false).etiquetas);
});

test("busca, sugestão por área e pesquisa no site do tribunal", () => {
  const base = { etiquetas: [], autorId: "a", autorNome: "Ana", criadoEm: "2026-10-01T00:00:00Z" };
  const itens: ItemBiblioteca[] = [
    { ...base, id: "1", tipo: "sumula", titulo: "Anotação irregular", referencia: "Súmula 385/STJ", area: "consumidor", atualizadoEm: "2026-10-01T00:00:00Z" },
    { ...base, id: "2", tipo: "modelo", titulo: "Reclamação trabalhista", area: "trabalhista", etiquetas: ["horas extras"], atualizadoEm: "2026-10-05T00:00:00Z" },
    { ...base, id: "3", tipo: "jurisprudencia", titulo: "Dano moral", texto: "Negativação INDEVIDA gera dano", atualizadoEm: "2026-10-03T00:00:00Z" },
  ];
  assert.deepEqual(filtrarItens(itens, { busca: "negativacao indevida" }).map((i) => i.id), ["3"]);
  assert.deepEqual(filtrarItens(itens, { busca: "385 stj" }).map((i) => i.id), ["1"]);
  assert.deepEqual(filtrarItens(itens, { busca: "horas" }).map((i) => i.id), ["2"]);
  assert.deepEqual(filtrarItens(itens, { tipo: "modelo" }).map((i) => i.id), ["2"]);
  assert.deepEqual(sugerirParaProcesso(itens, "consumidor").map((i) => i.id), ["1", "2", "3"]);
  assert.deepEqual(sugerirParaProcesso(itens).map((i) => i.id), ["2", "3", "1"]);
  assert.equal(pesquisaNoTribunal("TJSP", "dano moral"), "https://www.google.com/search?q=site%3Atjsp.jus.br%20jurisprud%C3%AAncia%20dano%20moral");
  assert.ok(pesquisaNoTribunal("trt2", "x")?.includes("trt2.jus.br"));
  assert.equal(pesquisaNoTribunal("tjsp.evil.com", "x"), undefined);
});

/** Comportamento comum às duas implementações. */
async function contrato(repo: BibliotecaRepository, ana: { id: string; nome: string }, beto: string) {
  const arquivos = new ArquivosEmMemoria();
  const bib = new BibliotecaService({ repo, arquivos, clock: relogio });

  const sumula = await bib.criar(ana, { tipo: "sumula", titulo: "  Anotação irregular  ", referencia: "Súmula 385/STJ", tribunal: "stj", texto: "Da anotação irregular…", etiquetas: "dano moral, negativação" });
  assert.equal(sumula.titulo, "Anotação irregular");
  assert.equal(sumula.tribunal, "STJ");
  assert.deepEqual(sumula.etiquetas, ["dano moral", "negativação"]);
  assert.equal(sumula.autorNome, "Ana");
  assert.equal(sumula.arquivo, undefined);

  const acordao = await bib.criar(ana, { tipo: "jurisprudencia", titulo: "REsp 1", link: "https://scon.stj.jus.br/x" }, { nome: "c:\\pasta\\acórdão.PDF", bytes: pdf("acordao") });
  assert.deepEqual(acordao.arquivo, { nome: "acórdão.pdf", tamanho: pdf("acordao").length, formato: "pdf" });
  const modelo = await bib.criar(ana, { tipo: "modelo", titulo: "Inicial de consumidor", area: "consumidor" }, { nome: "inicial.docx", bytes: docx() });
  assert.equal(modelo.arquivo?.formato, "docx");
  assert.ok(!("textoArquivo" in modelo) && !("caminho" in (modelo.arquivo ?? {})), "o que é interno não vai para a tela");
  assert.equal(arquivos.dados.size, 2);

  await assert.rejects(bib.criar(ana, { tipo: "modelo", titulo: "foto" }, { nome: "foto.png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }), erro("dados_invalidos"));
  await assert.rejects(bib.criar(ana, { tipo: "modelo", titulo: "sem nada" }), (e) => erro("dados_invalidos")(e) && (e as AppError).detalhes?.campo === "texto");
  assert.equal(arquivos.dados.size, 2, "o envio recusado não deixa arquivo para trás");

  assert.deepEqual((await bib.listar(ana.id)).map((i) => i.id).sort(), [sumula.id, acordao.id, modelo.id].sort());
  assert.deepEqual((await bib.abrir(ana.id, acordao.id)).bytes, pdf("acordao"));
  await assert.rejects(bib.abrir(ana.id, sumula.id), erro("nao_encontrado"), "item sem arquivo");

  // A edição troca os campos e apaga os opcionais deixados em branco; o arquivo continua.
  const editado = await bib.atualizar(ana.id, sumula.id, { tipo: "sumula", titulo: "Súmula 385", texto: "Novo texto", referencia: "" });
  assert.equal(editado.referencia, undefined);
  assert.equal(editado.tribunal, undefined);
  assert.equal(editado.texto, "Novo texto");
  assert.deepEqual(editado.etiquetas, []);
  assert.equal((await bib.atualizar(ana.id, acordao.id, { tipo: "jurisprudencia", titulo: "REsp 1 (editado)" })).arquivo?.nome, "acórdão.pdf");

  // A IA recebe o PDF, o texto colado e o texto tirado do Word, na ordem pedida.
  const ia = await bib.paraIa(ana.id, [modelo.id, novoId(), acordao.id, sumula.id]);
  assert.deepEqual(ia.map((c) => c.item.id), [modelo.id, acordao.id, sumula.id]);
  assert.match(ia[0].texto ?? "", /EXCELENTÍSSIMO/);
  assert.equal(ia[0].pdf, undefined);
  assert.deepEqual(ia[1].pdf, pdf("acordao"));
  assert.equal(ia[2].texto, "Novo texto");

  // Outro escritório não vê, não abre, não edita e não apaga.
  assert.deepEqual(await bib.listar(beto), []);
  await assert.rejects(bib.abrir(beto, acordao.id), erro("nao_encontrado"));
  await assert.rejects(bib.atualizar(beto, acordao.id, { tipo: "modelo", titulo: "x", texto: "y" }), erro("nao_encontrado"));
  await assert.rejects(bib.excluir(beto, acordao.id), erro("nao_encontrado"));
  assert.deepEqual(await bib.paraIa(beto, [acordao.id]), []);

  await bib.excluir(ana.id, acordao.id);
  assert.equal(arquivos.dados.size, 1, "excluir o item apaga o arquivo");
  return { bib, arquivos };
}

test("biblioteca em arquivo", async () => {
  const ana = { id: novoId(), nome: "Ana" };
  const { bib, arquivos } = await contrato(new BibliotecaRepositoryDocumentos(new ArmazenamentoEmMemoria()), ana, novoId());
  await bib.excluirDaConta(ana.id);
  assert.equal(arquivos.dados.size, 0);
  assert.deepEqual(await bib.listar(ana.id), []);
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

test("biblioteca no Postgres, isolada por escritório", opcoes, async () => {
  await banco.limpar();
  const usuarios = new UsuarioRepositoryPostgres(banco.db);
  const ana = usuario("ana@x.com");
  const beto = usuario("beto@x.com");
  await usuarios.criar(ana);
  await usuarios.criar(beto);
  const { bib, arquivos } = await contrato(new BibliotecaRepositoryPostgres(banco.db), { id: ana.id, nome: ana.nome }, beto.id);
  const [linha] = (await banco.db.select().from(bibliotecaItens)).filter((l) => l.tipo === "modelo");
  assert.match(linha.textoArquivo ?? "", /EXCELENTÍSSIMO/, "o texto do Word fica guardado para a IA");

  // Conta excluída (última do escritório): os arquivos somem e os itens vão junto com o escritório.
  await bib.excluirDaConta(ana.id);
  await usuarios.excluir(ana.id);
  assert.equal(arquivos.dados.size, 0);
  assert.equal((await banco.db.select().from(bibliotecaItens)).length, 0);
});
