import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Intimacao } from "../lib/types.ts";
import { anonimizar, anonimizarIntimacao, corrigir, lerCSV, nomesQueSobraram, paraCSV, selecionar, type Registro } from "../scripts/treino/dados-reais-prazos.mts";

const base = (o: Partial<Intimacao>): Intimacao =>
  ({ id: "1", origem: "comunica", cliente: "Maria Aparecida Souza", tribunal: "TJPR", orgao: "3ª Vara Cível de Curitiba", dataDisponibilizacao: "2026-11-03", tipoComunicacao: "Intimação", meio: "D", tipoDocumento: "Despacho", classe: "Procedimento Comum Cível", numeroProcesso: "0001234-56.2026.8.16.0001", partes: [{ nome: "MARIA APARECIDA SOUZA", polo: "A" }, { nome: "Banco Exemplo S.A.", polo: "P" }], advogados: [{ nome: "João Pereira Lima", oab: "12345", uf: "PR" }], texto: "", status: "nova", createdAt: "", updatedAt: "", ...o }) as Intimacao;

test("anonimizar: nomes (com acento e caixa diferentes), processo, CPF, OAB e contatos viram marcadores", () => {
  const i = base({ texto: "Processo 0001234-56.2026.8.16.0001. Maria Aparecida de Souza (CPF 123.456.789-09) contra BANCO EXEMPLO. Adv. Joao Pereira Lima, OAB/PR 12.345, joao@escritorio.com.br, (41) 99999-1234. Manifeste-se a autora Maria em 15 dias." });
  const t = anonimizarIntimacao(i).texto;
  for (const sobra of ["0001234", "123.456", "Pereira", "Aparecida", "Souza", "joao@", "99999", "OAB/PR", "EXEMPLO"]) assert.ok(!t.includes(sobra), `sobrou ${sobra}: ${t}`);
  assert.match(t, /\[AUTOR\]/);
  assert.match(t, /\[RÉU\]/);
  assert.match(t, /\[ADVOGADO\]/);
  assert.match(t, /em 15 dias/);
});

test("anonimizar: não estraga prazos, valores e palavras comuns", () => {
  const t = anonimizar("Pague R$ 12.000,00 em 15 (quinze) dias, art. 523 do CPC.", [{ nome: "Banco Silva", rotulo: "[RÉU]" }]);
  assert.equal(t, "Pague R$ 12.000,00 em 15 (quinze) dias, art. 523 do CPC.");
});

test("nomes que sobraram: acha nome de pessoa, ignora termos jurídicos", () => {
  assert.deepEqual(nomesQueSobraram("Nomeio perito o engenheiro Carlos Alberto Pereira. Tribunal de Justiça do Estado, Código Civil."), ["Carlos Alberto Pereira"]);
});

test("planilha: ida e volta com ponto e vírgula, aspas e quebra de linha", () => {
  const linhas = [["id", "Texto"], ["1", 'Disse "olá"; depois\nsaiu'], ["2", ""]];
  const volta = lerCSV(paraCSV(linhas));
  assert.deepEqual(volta[0], ["id", "Texto"]);
  assert.equal(volta[1][1], 'Disse "olá"; depois ⏎ saiu');
  assert.equal(volta.length, 3);
});

test("selecionar: tira segredo de justiça, texto curto e repetido", () => {
  const { escolhidas, fora } = selecionar([
    base({ id: "a", texto: "Manifeste-se a parte autora no prazo de 15 dias sobre a contestação apresentada." }),
    base({ id: "b", texto: "Manifeste-se a parte autora no prazo de 15 dias sobre a contestação apresentada." }),
    base({ id: "c", texto: "Processo que tramita em segredo de justiça. Intime-se a parte para se manifestar." }),
    base({ id: "d", texto: "curto" }),
  ]);
  assert.deepEqual(escolhidas.map((e) => e.id), ["a"]);
  assert.deepEqual(fora, { "texto repetido": 1, "segredo de justiça": 1, "sem texto": 1 });
});

test("corrigir: S aceita a proposta; correções trocam só o que foi preenchido; linha vazia fica de fora", () => {
  const texto = "Diga a parte autora sobre a petição de fls. 120, no prazo de 10 dias.";
  const r: Registro = {
    id: "1",
    dados: { texto, tribunal: "TJPR", classe: "Procedimento Comum Cível", orgao: "3ª Vara Cível", tipoDocumento: "Despacho", tipoComunicacao: "Intimação", dataDisponibilizacao: "2026-11-03" },
    proposta: { tarefa: "analisar", dias: 5, contagem: "uteis", dobro: false, prazoFixado: false, fundamento: "", trecho: "", dataAudiencia: "", horaAudiencia: "", confianca: "baixa", observacao: "" },
    propostaPor: "regras",
    situacao: "revisar",
    alertas: [],
    sobraram: [],
  };
  assert.equal(corrigir(r, texto, {}).motivo, "não revisada");
  const l = corrigir(r, texto, { "Tarefa certa": "manifestar", "Dias certos": "10" }).leitura!;
  assert.deepEqual([l.tarefa, l.dias, l.contagem, l.prazoFixado, l.confianca], ["manifestar", 10, "uteis", true, "alta"]);
  assert.match(l.trecho, /10 dias/);
  assert.match(corrigir(r, texto, { "Tarefa certa": "inventada" }).motivo ?? "", /desconhecida/);
});

test("suspeitos: expressão que se repete em 4+ textos é fórmula do Diário, não nome de pessoa", async () => {
  const { suspeitosPorTexto } = await import("../scripts/treino/dados-reais-prazos.mts");
  const textos = ["Publicado no Diário Eletrônico Nacional. Perito Carlos Alberto Pereira.", "Publicado no Diário Eletrônico Nacional.", "Publicado no Diário Eletrônico Nacional.", "Publicado no Diário Eletrônico Nacional."];
  const r = suspeitosPorTexto(textos);
  assert.equal(r[0].length, 1);
  assert.match(r[0][0], /Carlos Alberto Pereira/);
  assert.deepEqual(r[1], []);
});

test("cpj: só validadas, sem duplicadas, com apólice, sinistro, placa e nomes escondidos", async () => {
  const { limpar, anonimizarSeguros, leituraDaDecisao, conversaPrazos, conversaEventos, dividirPorGrupo } = await import("../scripts/treino/dados-cpj.mts");
  const pub = (texto: string) => ({ texto, tribunal: "TJPR", classe: "Procedimento Comum Cível", orgao: "3ª Vara Cível de Curitiba", tipoDocumento: "Despacho", tipoComunicacao: "Intimação", dataDisponibilizacao: "2026-11-03" });
  const dec = { evento: "Intimação para manifestar", tarefa: "manifestar", dias: 15, contagem: "uteis", dobro: false };
  const t1 = "Manifeste-se a Seguradora Exemplo sobre o sinistro nº 2024/123456, apólice 98765-43 e o veículo placa ABC1D23, no prazo de 15 dias.";
  const { limpos, fora } = limpar([
    { id: "1", processo: "p1", publicacao: pub(t1), cliente: { lado: "Réu" }, nomes: ["Seguradora Exemplo"], decisao: dec, situacao: "validada" },
    { id: "2", processo: "p2", publicacao: pub(t1), cliente: { lado: "reu" }, nomes: ["Seguradora Exemplo"], decisao: dec, situacao: "validada" },
    { id: "3", publicacao: pub(t1 + " Outro."), decisao: dec, situacao: "descartada" },
    { id: "4", publicacao: pub("Texto qualquer com mais de trinta caracteres aqui."), situacao: "validada" },
  ] as never);
  assert.equal(limpos.length, 1);
  assert.deepEqual(fora, { duplicada: 1, "situação: descartada": 1, "sem decisão": 1 });
  const t = limpos[0].publicacao.texto;
  for (const sobra of ["Exemplo", "123456", "98765", "ABC1D23"]) assert.ok(!t.includes(sobra), `sobrou ${sobra}: ${t}`);
  assert.equal(limpos[0].cliente?.lado, "reu");
  assert.ok(!("nomes" in limpos[0]));
  assert.match(anonimizarSeguros("Chassi 9BWZZZ377VT004251 e RENAVAM 123456789012", []), /\[CHASSI\]/);

  const { leitura } = leituraDaDecisao(limpos[0]);
  assert.equal(leitura?.tarefa, "manifestar");
  assert.equal(leitura?.prazoFixado, true);
  const c = conversaPrazos(limpos[0], leitura!);
  assert.match(c.messages[1].content, /Lado do nosso cliente: réu/);
  assert.equal(JSON.parse(conversaEventos(limpos[0]).messages[2].content).evento, "Intimação para manifestar");
  assert.equal(leituraDaDecisao({ ...limpos[0], decisao: { tarefa: "inventada", dias: 3, contagem: "uteis" } }).motivo, "tarefa desconhecida: inventada");

  const itens = Array.from({ length: 300 }, (_, k) => ({ grupo: `proc${k % 100}`, k }));
  const d = dividirPorGrupo(itens);
  const onde = new Map<string, Set<string>>();
  for (const [nome, l] of Object.entries(d)) for (const i of l) onde.set(i.grupo, (onde.get(i.grupo) ?? new Set()).add(nome));
  assert.ok([...onde.values()].every((s) => s.size === 1), "um processo caiu em dois conjuntos");
  assert.equal(d.treino.length + d.validacao.length + d.teste.length, 300);
});
