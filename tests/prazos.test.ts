import { test } from "node:test";
import assert from "node:assert/strict";
import { Calendario, feriadosDoAno, pascoa } from "../lib/prazos/calendario.ts";
import { aplicarRegra, calcularPrazo, contagemPadrao, lerPrazoDoTexto, sugerirRegra } from "../lib/prazos/calculo.ts";

const uteis = (dias: number, dobro = false) => ({ dias, contagem: "uteis" as const, dobro });
const corridos = (dias: number) => ({ dias, contagem: "corridos" as const, dobro: false });

test("calcula a Páscoa e os feriados móveis", () => {
  assert.equal(pascoa(2024), "2024-03-31");
  assert.equal(pascoa(2026), "2026-04-05");
  assert.equal(pascoa(2027), "2027-03-28");
  const f2027 = feriadosDoAno(2027).map((f) => f.data);
  assert.ok(f2027.includes("2027-02-08") && f2027.includes("2027-02-09"), "Carnaval");
  assert.ok(f2027.includes("2027-03-26"), "Sexta-feira Santa");
  assert.ok(!f2027.includes("2027-05-27"), "Corpus Christi não é nacional");
});

test("Consciência Negra só a partir de 2024", () => {
  assert.ok(!feriadosDoAno(2023).some((f) => f.data === "2023-11-20"));
  assert.ok(feriadosDoAno(2024).some((f) => f.data === "2024-11-20"));
});

test("Justiça Federal tem os feriados da Lei 5.010", () => {
  const tj = new Calendario("TJSP");
  const trf = new Calendario("TRF3");
  assert.equal(tj.ehUtil("2026-12-08"), true);
  assert.equal(trf.ehUtil("2026-12-08"), false);
  assert.equal(trf.ehUtil("2026-04-01"), false, "quarta-feira santa");
});

test("dias úteis: publicação e início pulam o feriado, vencimento pula Finados", () => {
  // Quinta 08/10/2026 → publicação sexta 09/10 → segunda 12/10 é feriado → início terça 13/10.
  const r = calcularPrazo("2026-10-08", uteis(15), new Calendario("TJSP"))!;
  assert.equal(r.publicacao, "2026-10-09");
  assert.equal(r.inicio, "2026-10-13");
  assert.equal(r.fim, "2026-11-03");
  assert.deepEqual(r.pulados.map((p) => p.data), ["2026-11-02"]);
  assert.equal(r.finsDeSemana, 6);
});

test("prazo em dobro conta o dobro de dias", () => {
  const r = calcularPrazo("2026-10-08", uteis(5, true), new Calendario("TJSP"))!;
  assert.equal(r.dias, 10);
  assert.equal(r.fim, "2026-10-26");
});

test("recesso de fim de ano suspende publicação e contagem", () => {
  const r = calcularPrazo("2026-12-18", uteis(5), new Calendario("TJSP"))!;
  assert.equal(r.publicacao, "2027-01-21");
  assert.equal(r.inicio, "2027-01-22");
  assert.equal(r.fim, "2027-01-28");
});

test("prazo que atravessa o recesso fica parado entre 20/12 e 20/01", () => {
  // Disponibilizada quinta 10/12/2026 → publicação 11/12 → início segunda 14/12.
  // Conta 14 a 18/12 (5 dias), para no recesso e volta em 21/01/2027.
  const r = calcularPrazo("2026-12-10", uteis(8), new Calendario("TJSP"))!;
  assert.equal(r.inicio, "2026-12-14");
  assert.equal(r.fim, "2027-01-25");
});

test("dias corridos: conta o fim de semana e prorroga se vencer sem expediente", () => {
  const r = calcularPrazo("2026-10-08", corridos(5), new Calendario("TJSP"))!;
  assert.equal(r.inicio, "2026-10-13");
  assert.equal(r.prorrogadoDe, "2026-10-17");
  assert.equal(r.fim, "2026-10-19");
});

test("suspensão cadastrada vale só para o tribunal indicado", () => {
  const susp = [{ id: "1", inicio: "2026-10-14", fim: "2026-10-15", descricao: "Portaria 123 - sistema fora do ar", tribunal: "TJSP" }];
  const tjsp = calcularPrazo("2026-10-08", uteis(5), new Calendario("TJSP", susp))!;
  const tjmg = calcularPrazo("2026-10-08", uteis(5), new Calendario("TJMG", susp))!;
  assert.equal(tjmg.fim, "2026-10-19");
  assert.equal(tjsp.fim, "2026-10-21");
  assert.deepEqual(tjsp.pulados.map((p) => p.motivo), ["Portaria 123 - sistema fora do ar", "Portaria 123 - sistema fora do ar"]);
});

test("regra inválida não calcula", () => {
  assert.equal(calcularPrazo("2026-10-08", uteis(0), new Calendario("TJSP")), null);
  assert.equal(calcularPrazo("2026-13-08", uteis(5), new Calendario("TJSP")), null);
});

test("lê o número de dias no texto da intimação", () => {
  assert.deepEqual(lerPrazoDoTexto("Fica a parte ré intimada para, no prazo de 15 (quinze) dias, apresentar contestação."), {
    dias: 15,
    contagem: undefined,
    trecho: "no prazo de 15 (quinze) dias",
  });
  assert.equal(lerPrazoDoTexto("Manifeste-se a parte autora no prazo comum de cinco dias úteis.")?.dias, 5);
  assert.equal(lerPrazoDoTexto("Manifeste-se a parte autora no prazo comum de cinco dias úteis.")?.contagem, "uteis");
  assert.equal(lerPrazoDoTexto("Intime-se para pagamento em 3 dias corridos")?.contagem, "corridos");
  assert.equal(lerPrazoDoTexto("Prazo: 10 dias.")?.dias, 10);
  assert.equal(lerPrazoDoTexto("Apresente contrarrazões no prazo legal."), null);
  assert.equal(lerPrazoDoTexto("Cumpra-se em 48 horas."), null);
  assert.equal(lerPrazoDoTexto("<p>no prazo de <b>8</b> dias</p>")?.dias, 8);
});

test("contagem padrão é corrida na matéria penal", () => {
  assert.equal(contagemPadrao({ classe: "Ação Penal - Procedimento Ordinário", orgao: "1ª Vara" }), "corridos");
  assert.equal(contagemPadrao({ classe: "Procedimento Comum Cível", orgao: "2ª Vara Criminal" }), "corridos");
  assert.equal(contagemPadrao({ classe: "Procedimento Comum Cível", orgao: "5ª Vara Cível" }), "uteis");
});

test("sugere regra a partir do texto e recalcula o prazo", () => {
  const regra = sugerirRegra({ texto: "no prazo de 15 dias", classe: "", orgao: "" })!;
  assert.equal(regra.fonte, "texto");
  const i = aplicarRegra({ tribunal: "TJSP", dataDisponibilizacao: "2026-10-08", regraPrazo: regra, prazo: undefined }, []);
  assert.equal(i.prazo, "2026-11-03");
  const manual = { tribunal: "TJSP", dataDisponibilizacao: "2026-10-08", regraPrazo: undefined, prazo: "2026-10-20" };
  assert.equal(aplicarRegra(manual, []), manual);
});
