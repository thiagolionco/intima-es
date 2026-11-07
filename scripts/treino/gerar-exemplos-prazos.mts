/**
 * Gera exemplos INVENTADOS para treinar um modelo pequeno a ler prazos (Agente de Prazos).
 *
 *   node --experimental-strip-types scripts/treino/gerar-exemplos-prazos.mts [--quantidade 900] [--semente 7] [--saida treino/dados]
 *
 * A resposta certa de cada exemplo é decidida na hora de montar o texto (o gabarito nasce junto
 * com a publicação), então não depende de IA nem de revisão. Cada exemplo ainda passa pelo
 * conferente do Clepsa: se ele achar qualquer alerta grave, o exemplo é jogado fora.
 *
 * Saída (JSONL, uma conversa por linha, no formato de chat):
 *   treino.jsonl (80%), validacao.jsonl (10%), teste.jsonl (10%) e resumo.json
 * As 28 avaliações de tests/evals NUNCA entram aqui: elas ficam só para o teste final.
 * Nenhum dado de cliente: nomes, números de processo e fatos são todos inventados.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { conferir, leituraValida, normalizarTexto, type DadosAgentePrazos, type LeituraPrazo } from "../../lib/prazos/agente-prazos.ts";
import type { TipoTarefa } from "../../lib/tarefas.ts";
import { INSTRUCOES_LEITOR } from "../../server/ia/agente-prazos.ts";
import { CASOS } from "../../tests/evals/agente-prazos.casos.ts";

// ---------- sorteio repetível ----------
function criarSorteio(semente: number) {
  let s = semente >>> 0 || 1;
  const prox = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
  return {
    prox,
    int: (a: number, b: number) => a + Math.floor(prox() * (b - a + 1)),
    um: <T,>(l: readonly T[]): T => l[Math.floor(prox() * l.length)],
    sim: (p = 0.5) => prox() < p,
  };
}
type Sorteio = ReturnType<typeof criarSorteio>;

// ---------- peças de texto ----------
const POR_EXTENSO: Record<number, string> = { 2: "dois", 3: "três", 5: "cinco", 8: "oito", 10: "dez", 15: "quinze", 20: "vinte", 30: "trinta" };
const dias = (n: number, r: Sorteio) => (POR_EXTENSO[n] && r.sim(0.6) ? `${n} (${POR_EXTENSO[n]}) dias` : `${n} dias`);

const dd = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const somar = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Dia de semana útil entre 03/11/2026 e 30/04/2027 (a disponibilização). */
function dataDisp(r: Sorteio): Date {
  for (;;) {
    const d = somar(new Date(Date.UTC(2026, 10, 3)), r.int(0, 178));
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) return d;
  }
}

const INICIOS = ["", "", "", "Vistos.", "Vistos, etc.", "Considerando o petitório de fls. {n}:", "Decido."];
const FINS = ["", "", "Intime-se.", "Intimem-se.", "Int.", "Publique-se. Intime-se.", "Cumpra-se."];
const AUTOR = ["a parte autora", "o autor", "a autora", "a requerente"];
const REU = ["a parte ré", "o réu", "a ré", "o requerido"];

const num = (r: Sorteio) => r.int(12, 480);
const moldar = (partes: (string | undefined)[], r: Sorteio) => partes.concat([]).filter(Boolean).join(" ").replace(/\{n\}/g, String(num(r))).replace(/\s+/g, " ").trim();

// ---------- ramos da justiça ----------
interface Ramo {
  nome: "civel" | "trabalho" | "penal" | "juizado" | "federal";
  tribunais: string[];
  classes: string[];
  orgaos: (r: Sorteio) => string;
}
const CIDADES = ["Curitiba", "Londrina", "Maringá", "Cascavel", "Ponta Grossa", "São Paulo", "Campinas", "Porto Alegre", "Belo Horizonte", "Recife", "Salvador", "Goiânia", "Florianópolis", "Fortaleza"];
const RAMOS: Record<Ramo["nome"], Ramo> = {
  civel: {
    nome: "civel",
    tribunais: ["TJPR", "TJSP", "TJRS", "TJMG", "TJSC", "TJGO", "TJBA", "TJPE"],
    classes: ["Procedimento Comum Cível", "Cumprimento de Sentença", "Execução de Título Extrajudicial", "Ação de Cobrança", "Ação de Indenização", "Ação Declaratória"],
    orgaos: (r) => `${r.int(1, 12)}ª Vara Cível de ${r.um(CIDADES)}`,
  },
  trabalho: {
    nome: "trabalho",
    tribunais: ["TRT9", "TRT2", "TRT4", "TRT3", "TRT15", "TRT12"],
    classes: ["Ação Trabalhista - Rito Ordinário", "Ação Trabalhista - Rito Sumaríssimo", "Cumprimento de Sentença Trabalhista"],
    orgaos: (r) => `${r.int(1, 9)}ª Vara do Trabalho de ${r.um(CIDADES)}`,
  },
  penal: {
    nome: "penal",
    tribunais: ["TJPR", "TJSP", "TJRS", "TJMG", "TJSC"],
    classes: ["Ação Penal - Procedimento Ordinário", "Ação Penal - Procedimento Sumário", "Ação Penal de Competência do Júri"],
    orgaos: (r) => `${r.int(1, 8)}ª Vara Criminal de ${r.um(CIDADES)}`,
  },
  juizado: {
    nome: "juizado",
    tribunais: ["TJPR", "TJSP", "TJRS", "TJSC"],
    classes: ["Procedimento do Juizado Especial Cível"],
    orgaos: (r) => `${r.int(1, 6)}º Juizado Especial Cível de ${r.um(CIDADES)}`,
  },
  federal: {
    nome: "federal",
    tribunais: ["TRF4", "TRF3", "TRF1", "TRF2"],
    classes: ["Procedimento Comum", "Execução Fiscal", "Mandado de Segurança"],
    orgaos: (r) => `${r.int(1, 12)}ª Vara Federal de ${r.um(CIDADES)}`,
  },
};

// ---------- as famílias de publicação ----------
interface Montado {
  ramo: Ramo["nome"];
  tipoDocumento: string;
  tipoComunicacao?: string;
  classe?: string;
  orgao?: string;
  texto: string;
  tarefa: TipoTarefa;
  dias: number;
  /** O texto traz o número de dias escrito? */
  escrito: boolean;
  dobro?: boolean;
  fundamento: string;
  /** Pedaço literal do texto que sustenta a leitura. */
  trecho: string;
  audiencia?: { data: Date; hora: string };
}
interface Familia {
  id: string;
  gerar: (r: Sorteio, d: Date) => Montado;
}

const DOBRO_QUEM = [
  { sujeito: "a Fazenda Pública do Estado", orgao: (r: Sorteio) => `${r.int(1, 4)}ª Vara da Fazenda Pública de ${r.um(CIDADES)}`, explicito: true },
  { sujeito: "a Defensoria Pública, que assiste a parte ré,", orgao: undefined, explicito: false },
  { sujeito: "o Ministério Público", orgao: undefined, explicito: false },
];

function prazoTexto(n: number, r: Sorteio) {
  const t = dias(n, r);
  return { t, trecho: `${n}` };
}

/** Constrói uma família de "providência com prazo escrito" a partir de um molde. */
function comPrazo(id: string, ramo: Ramo["nome"], tarefa: TipoTarefa, opcoes: number[], molde: (r: Sorteio, p: string) => string, extra: Partial<Montado> = {}): Familia {
  return {
    id,
    gerar: (r) => {
      const n = r.um(opcoes);
      const { t } = prazoTexto(n, r);
      const corpo = molde(r, t);
      const texto = moldar([r.um(INICIOS), corpo, r.um(FINS)], r);
      return { ramo, tipoDocumento: "Despacho", tipoComunicacao: "Intimação", texto, tarefa, dias: n, escrito: true, fundamento: "Fixado pelo juízo", trecho: t, ...extra };
    },
  };
}

/** Sem número de dias no texto: vale o prazo da lei. */
function semPrazo(id: string, ramo: Ramo["nome"], tarefa: TipoTarefa, diasLei: number, fundamento: string, tipoDocumento: string, moldes: (r: Sorteio) => string, extra: Partial<Montado> = {}): Familia {
  return {
    id,
    gerar: (r) => {
      const corpo = moldes(r);
      const texto = moldar([r.um(INICIOS), corpo, r.um(FINS)], r);
      return { ramo, tipoDocumento, tipoComunicacao: "Intimação", texto, tarefa, dias: diasLei, escrito: false, fundamento, trecho: corpo.replace(/\{n\}/g, "").split(/(?<=\.)\s/)[0].slice(0, 200), ...extra };
    },
  };
}

const SENTENCAS_CIVEL = [
  (r: Sorteio) => `Ante o exposto, JULGO PROCEDENTE o pedido para condenar ${r.um(REU)} ao pagamento de R$ ${r.int(2, 90)}.000,00, com correção monetária e juros. Custas pela ré. P.R.I.`,
  (r: Sorteio) => `Diante do exposto, JULGO IMPROCEDENTES os pedidos formulados por ${r.um(AUTOR)}, extinguindo o processo com resolução do mérito (art. 487, I, do CPC). Condeno a parte autora ao pagamento das custas.`,
  (r: Sorteio) => `Isto posto, JULGO PARCIALMENTE PROCEDENTE a ação para declarar a inexistência do débito e condenar a ré a pagar R$ ${r.int(1, 15)}.000,00 a título de danos morais. Sem condenação em honorários recíprocos.`,
  (_r: Sorteio) => `Ante o exposto, HOMOLOGO o pedido de desistência e JULGO EXTINTO o processo, sem resolução do mérito, nos termos do art. 485, VIII, do CPC. Custas pela parte autora.`,
];
const SENTENCAS_TRAB = [
  (r: Sorteio) => `Diante do exposto, julgo PROCEDENTES EM PARTE os pedidos formulados pelo reclamante para condenar a reclamada ao pagamento de horas extras e reflexos. Custas de R$ ${r.int(2, 9)}00,00 pela reclamada. Intimem-se as partes.`,
  (_r: Sorteio) => `Isto posto, julgo IMPROCEDENTES os pedidos da reclamação trabalhista. Custas pelo reclamante, dispensado o recolhimento por ser beneficiário da justiça gratuita. Intimem-se as partes.`,
];
const SENTENCAS_PENAL = [
  (r: Sorteio) => `Ante o exposto, JULGO PROCEDENTE a denúncia para condenar o réu à pena de ${r.int(1, 8)} anos de reclusão, em regime ${r.um(["aberto", "semiaberto", "fechado"])}. Intime-se a defesa.`,
  (_r: Sorteio) => `Diante do exposto, JULGO IMPROCEDENTE a pretensão punitiva e ABSOLVO o acusado, com fundamento no art. 386, VII, do CPP. Intime-se a defesa.`,
];
const SENTENCAS_JUIZADO = [
  (_r: Sorteio) => `Dispensado o relatório (art. 38 da Lei 9.099/95). JULGO IMPROCEDENTE o pedido inicial. Sem custas e honorários nesta fase. Intimem-se.`,
  (r: Sorteio) => `Dispensado o relatório. JULGO PROCEDENTE o pedido para condenar a reclamada ao pagamento de R$ ${r.int(1, 9)}.${r.int(1, 9)}00,00 por danos materiais. Sem custas nesta fase.`,
];

const FAMILIAS: Familia[] = [
  // ---- cível ----
  comPrazo("replica", "civel", "replica", [15, 15, 15, 10], (r, p) => `Manifeste-se ${r.um(AUTOR)} sobre a contestação e os documentos que a acompanham, no prazo de ${p}.`),
  semPrazo("contestar-legal", "civel", "contestar", 15, "CPC, art. 335", "Citação", (r) => `Cite-se ${r.um(REU)} para, querendo, apresentar contestação no prazo legal, sob pena de revelia.`, { }),
  comPrazo("pagar", "civel", "pagar", [15, 15, 3], (r, p) => `Intime-se o executado para pagar o débito, no prazo de ${p}, sob pena de multa de 10% e honorários de 10% (art. 523 do CPC).`, { classe: "Cumprimento de Sentença" }),
  comPrazo("emendar", "civel", "emendar", [15, 15, 10], (r, p) => `Emende ${r.um(AUTOR)} a petição inicial, no prazo de ${p}, para ${r.um(["juntar comprovante de residência atualizado", "esclarecer o valor da causa", "regularizar a procuração", "indicar o endereço da parte ré"])}, sob pena de indeferimento.`),
  comPrazo("custas", "civel", "custas", [5, 10, 15], (r, p) => `Recolha ${r.um(AUTOR)} as custas ${r.um(["iniciais", "de preparo", "complementares"])}, no prazo de ${p}, sob pena de cancelamento da distribuição (art. 290 do CPC).`),
  comPrazo("pericia", "civel", "pericia", [15, 15, 10], (r, p) => `Defiro a prova pericial. Nomeio perito ${r.um(["o engenheiro civil", "a médica", "o contador"])} ${r.um(["João da Silva", "Maria Souza", "Carlos Pereira"])}. Intimem-se as partes para apresentar quesitos e indicar assistentes técnicos no prazo de ${p}.`),
  comPrazo("laudo", "civel", "pericia", [15, 10, 5], (r, p) => `Juntado o laudo pericial, intimem-se as partes para manifestação sobre o laudo, no prazo de ${p}.`),
  comPrazo("especificar", "civel", "especificar_provas", [5, 10, 15], (r, p) => `Especifiquem as partes as provas que pretendem produzir, justificando a pertinência, no prazo de ${p}.`),
  comPrazo("juntar", "civel", "juntar_documentos", [5, 10, 15, 30], (r, p) => `Junte ${r.um(AUTOR)} aos autos ${r.um(["cópia do contrato", "os comprovantes de pagamento", "procuração com poderes especiais", "o extrato bancário do período"])}, no prazo de ${p}.`),
  comPrazo("alegacoes", "civel", "alegacoes_finais", [15, 10, 5], (r, p) => `Encerrada a instrução. Apresentem as partes alegações finais por memoriais, no prazo sucessivo de ${p}, a começar pela autora.`),
  comPrazo("manifestar", "civel", "manifestar", [5, 10, 15], (r, p) => `Diga ${r.um(AUTOR)} sobre ${r.um(["a petição de fls. {n}", "o documento juntado às fls. {n}", "a certidão do oficial de justiça"])}, no prazo de ${p}.`),
  semPrazo("manifestar-sem", "civel", "manifestar", 5, "CPC, art. 218, § 3º", "Despacho", (r) => `Diga ${r.um(AUTOR)} sobre ${r.um(["a petição de fls. {n} e documentos que a acompanham", "o ofício de fls. {n}", "a resposta de fls. {n}"])}.`),
  semPrazo("contrarrazoes", "civel", "contrarrazoar", 15, "CPC, art. 1.010, § 1º", "Despacho", (r) => `Interposta apelação ${r.um(["pela ré", "pelo autor", "pela parte requerida"])}, intime-se o apelado para apresentar contrarrazões. Após, remetam-se os autos ao Tribunal.`),
  semPrazo("embargos", "civel", "manifestar", 5, "CPC, art. 1.023, § 2º", "Despacho", (r) => `Opostos embargos de declaração ${r.um(["pela ré", "pelo autor"])} com pedido de efeitos infringentes, intime-se a parte embargada para manifestação no prazo de 5 (cinco) dias (art. 1.023, § 2º, do CPC).`, { escrito: true, trecho: "5 (cinco) dias" } as Partial<Montado>),
  {
    id: "sentenca-civel",
    gerar: (r) => {
      const texto = moldar([r.um(SENTENCAS_CIVEL)(r)], r);
      return { ramo: "civel", tipoDocumento: "Sentença", tipoComunicacao: "Intimação", texto, tarefa: "avaliar_recurso", dias: 15, escrito: false, fundamento: "CPC, arts. 1.003, § 5º, e 1.009", trecho: texto.split(/(?<=\.)\s/)[0].slice(0, 200) };
    },
  },
  {
    id: "decisao-tutela",
    gerar: (r) => {
      const negar = r.sim();
      const corpo = negar ? `Ausente a probabilidade do direito (art. 300 do CPC), indefiro o pedido de tutela de urgência. Aguarde-se a contestação.` : `Presentes a probabilidade do direito e o perigo de dano, defiro a tutela de urgência para determinar que a ré se abstenha de ${r.um(["negativar o nome do autor", "cobrar a parcela", "suspender o fornecimento"])}, sob pena de multa diária.`;
      const texto = moldar([corpo], r);
      return { ramo: "civel", tipoDocumento: "Decisão", tipoComunicacao: "Intimação", texto, tarefa: "avaliar_recurso", dias: 15, escrito: false, fundamento: "CPC, arts. 1.003, § 5º, e 1.015", trecho: texto.split(/(?<=\.)\s/)[0].slice(0, 200) };
    },
  },
  {
    id: "acordao",
    gerar: (r) => {
      const camara = `${r.int(1, 20)}ª Câmara Cível`;
      const texto = moldar([`ACORDAM os Desembargadores integrantes da ${camara} do Tribunal de Justiça, por unanimidade de votos, em ${r.um(["negar provimento ao recurso", "dar provimento ao recurso", "dar parcial provimento ao recurso"])}.`], r);
      return { ramo: "civel", tipoDocumento: "Acórdão", tipoComunicacao: "Intimação", orgao: camara, classe: "Apelação Cível", texto, tarefa: "avaliar_recurso", dias: 15, escrito: false, fundamento: "CPC, art. 1.003, § 5º", trecho: texto.split(/(?<=\.)\s/)[0].slice(0, 200) };
    },
  },
  {
    id: "audiencia",
    gerar: (r, d) => {
      const data = somar(d, r.int(15, 80));
      const alvo = data.getUTCDay() === 0 ? somar(data, 1) : data.getUTCDay() === 6 ? somar(data, 2) : data;
      const hora = `${String(r.int(9, 17)).padStart(2, "0")}:${r.um(["00", "30"])}`;
      const [h, m] = hora.split(":");
      const horaTxt = m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
      const tipo = r.um(["de conciliação", "de instrução e julgamento", "una"]);
      const texto = moldar([`Designo audiência ${tipo} para o dia ${dd(alvo)}, às ${horaTxt}, a realizar-se ${r.um(["por videoconferência", "na sala de audiências deste Juízo", "de forma presencial"])}. Intimem-se as partes.`], r);
      return { ramo: "civel", tipoDocumento: "Despacho", tipoComunicacao: "Intimação", texto, tarefa: "audiencia", dias: 0, escrito: false, fundamento: "", trecho: `audiência ${tipo} para o dia ${dd(alvo)}`, audiencia: { data: alvo, hora } };
    },
  },
  {
    id: "ciencia",
    gerar: (r) => {
      const corpo = r.um([
        "Certificado o trânsito em julgado, arquivem-se os autos com as cautelas de praxe.",
        "Cumprida a determinação, remetam-se os autos ao arquivo.",
        "Ciência às partes da redistribuição do feito a esta Vara.",
        "Ciência à parte autora do ofício de fls. {n}. Nada sendo requerido, arquivem-se.",
      ]);
      const texto = moldar([corpo], r);
      return { ramo: "civel", tipoDocumento: "Despacho", tipoComunicacao: "Intimação", texto, tarefa: "ciencia", dias: 0, escrito: false, fundamento: "", trecho: texto.split(/(?<=\.)\s/)[0].slice(0, 200) };
    },
  },
  {
    id: "dobro",
    gerar: (r) => {
      const q = r.um(DOBRO_QUEM);
      const base = r.um([5, 10, 15]);
      const tarefa: TipoTarefa = r.um(["manifestar", "especificar_provas", "manifestar"]);
      const verbo = tarefa === "manifestar" ? "manifestar-se sobre o pedido de cumprimento de sentença" : "especificar as provas que pretende produzir";
      const t = dias(base, r);
      const dobroEscrito = q.explicito && r.sim(0.6) ? `, observado o prazo em dobro (art. 183 do CPC)` : "";
      const texto = moldar([r.um(INICIOS), `Intime-se ${q.sujeito} para, no prazo de ${t}, ${verbo}${dobroEscrito}.`, r.um(FINS)], r);
      return { ramo: "civel", tipoDocumento: "Despacho", tipoComunicacao: "Intimação", orgao: q.orgao?.(r), texto, tarefa, dias: base, escrito: true, dobro: true, fundamento: "Fixado pelo juízo; prazo em dobro (CPC, arts. 180, 183 e 186)", trecho: t };
    },
  },
  // ---- trabalho ----
  {
    id: "sentenca-trabalho",
    gerar: (r) => {
      const texto = moldar([r.um(SENTENCAS_TRAB)(r)], r);
      return { ramo: "trabalho", tipoDocumento: "Sentença", tipoComunicacao: "Intimação", texto, tarefa: "avaliar_recurso", dias: 8, escrito: false, fundamento: "CLT, art. 895", trecho: texto.split(/(?<=\.)\s/)[0].slice(0, 200) };
    },
  },
  comPrazo("calculos", "trabalho", "manifestar", [8, 5, 10], (r, p) => `Vista à ${r.um(["reclamada", "reclamante"])} sobre os cálculos de liquidação apresentados pelo perito contábil, pelo prazo de ${p}.`),
  semPrazo("contrarrazoes-trabalho", "trabalho", "contrarrazoar", 8, "CLT, art. 900", "Despacho", (r) => `Recebo o recurso ordinário interposto ${r.um(["pela reclamada", "pelo reclamante"])}. Intime-se a parte contrária para, querendo, apresentar contrarrazões.`),
  // ---- penal ----
  comPrazo("resposta-acusacao", "penal", "contestar", [10], (r, p) => `Recebo a denúncia. Cite-se o acusado para responder à acusação, por escrito, no prazo de ${p}, nos termos do art. 396 do CPP.`, { tipoComunicacao: "Citação" }),
  {
    id: "sentenca-penal",
    gerar: (r) => {
      const texto = moldar([r.um(SENTENCAS_PENAL)(r)], r);
      return { ramo: "penal", tipoDocumento: "Sentença", tipoComunicacao: "Intimação", texto, tarefa: "avaliar_recurso", dias: 5, escrito: false, fundamento: "CPP, art. 593", trecho: texto.split(/(?<=\.)\s/)[0].slice(0, 200) };
    },
  },
  comPrazo("memoriais-penal", "penal", "alegacoes_finais", [5], (r, p) => `Encerrada a instrução, apresente a defesa memoriais, no prazo de ${p}, nos termos do art. 403, § 3º, do CPP.`),
  // ---- juizado ----
  {
    id: "sentenca-juizado",
    gerar: (r) => {
      const texto = moldar([r.um(SENTENCAS_JUIZADO)(r)], r);
      return { ramo: "juizado", tipoDocumento: "Sentença", tipoComunicacao: "Intimação", texto, tarefa: "avaliar_recurso", dias: 10, escrito: false, fundamento: "Lei 9.099/95, art. 42", trecho: texto.split(/(?<=\.)\s/)[0].slice(0, 200) };
    },
  },
  // ---- federal ----
  comPrazo("laudo-federal", "federal", "pericia", [15, 10], (r, p) => `Juntado o laudo pericial, intimem-se as partes para manifestação sobre o laudo, no prazo de ${p}.`),
];

// O prazo em dobro é raro no dia a dia, mas é onde o erro custa mais: entra 4 vezes mais no sorteio.
const DOBRO = FAMILIAS.find((f) => f.id === "dobro")!;
FAMILIAS.push(DOBRO, DOBRO, DOBRO);

// ---------- montagem ----------
function descrever(i: DadosAgentePrazos): string {
  // Igual a server/ia/agente-prazos.ts (função `descrever`): o treino precisa ver o mesmo pedido da produção.
  return [
    `Tribunal: ${i.tribunal || "não informado"}`,
    `Órgão: ${i.orgao || "não informado"}`,
    `Classe: ${i.classe || "não informada"}`,
    `Tipo de documento: ${i.tipoDocumento || "não informado"}`,
    `Tipo de comunicação: ${i.tipoComunicacao || "não informado"}`,
    `Disponibilizada em: ${i.dataDisponibilizacao}`,
  ].join("\n");
}

function leituraDe(m: Montado, contagem: "uteis" | "corridos"): LeituraPrazo {
  return {
    tarefa: m.tarefa,
    dias: m.dias,
    contagem,
    dobro: !!m.dobro,
    prazoFixado: m.escrito,
    fundamento: m.fundamento,
    trecho: m.trecho,
    dataAudiencia: m.audiencia ? iso(m.audiencia.data) : "",
    horaAudiencia: m.audiencia?.hora ?? "",
    confianca: "alta",
    observacao: "",
  };
}

export interface Exemplo {
  familia: string;
  dados: DadosAgentePrazos;
  leitura: LeituraPrazo;
}

export function gerar(quantidade: number, semente: number): { exemplos: Exemplo[]; descartados: Record<string, number> } {
  const r = criarSorteio(semente);
  const proibidos = new Set(CASOS.map((c) => normalizarTexto(c.intimacao.texto ?? "")));
  const vistos = new Set<string>();
  const exemplos: Exemplo[] = [];
  const descartados: Record<string, number> = {};
  const nota = (motivo: string) => (descartados[motivo] = (descartados[motivo] ?? 0) + 1);
  let tentativas = 0;
  while (exemplos.length < quantidade && tentativas < quantidade * 40) {
    const f = FAMILIAS[tentativas % FAMILIAS.length];
    tentativas++;
    const disp = dataDisp(r);
    const m = f.gerar(r, disp);
    const ramo = RAMOS[m.ramo];
    const dados: DadosAgentePrazos = {
      tribunal: r.um(ramo.tribunais),
      classe: m.classe ?? r.um(ramo.classes),
      orgao: m.orgao ?? ramo.orgaos(r),
      tipoDocumento: m.tipoDocumento,
      tipoComunicacao: m.tipoComunicacao ?? "Intimação",
      dataDisponibilizacao: iso(disp),
      texto: m.texto,
    };
    const contagem = m.ramo === "penal" ? "corridos" : "uteis";
    const leitura = leituraDe(m, contagem);
    const chave = normalizarTexto(dados.texto ?? "");
    if (proibidos.has(chave)) { nota("igual a uma das 28 avaliações"); continue; }
    if (vistos.has(chave + dados.tribunal + dados.dataDisponibilizacao)) { nota("repetido"); continue; }
    if (!leituraValida(leitura)) { nota("leitura inválida"); continue; }
    const c = conferir(dados, leitura, [], dados.dataDisponibilizacao);
    const graves = c.alertas.filter((a) => a.gravidade === "grave");
    if (graves.length) { nota(`conferente: ${graves[0].codigo}`); continue; }
    vistos.add(chave + dados.tribunal + dados.dataDisponibilizacao);
    exemplos.push({ familia: f.id, dados, leitura });
  }
  return { exemplos, descartados };
}

export function comoConversa(e: Exemplo) {
  const publicacao = `<documento titulo="Publicação">\n${(e.dados.texto ?? "").slice(0, 20_000)}\n</documento>\n\n${descrever(e.dados)}\n\nLeia a publicação e responda.`;
  return { messages: [{ role: "system", content: INSTRUCOES_LEITOR }, { role: "user", content: publicacao }, { role: "assistant", content: JSON.stringify(e.leitura) }] };
}

/** Divide 80/10/10 sem misturar a mesma família de texto em conjuntos diferentes por acaso: sorteio fixo pela semente. */
export function dividir<T>(itens: T[], semente: number): { treino: T[]; validacao: T[]; teste: T[] } {
  const r = criarSorteio(semente + 1);
  const l = [...itens];
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(r.prox() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  const nT = Math.round(l.length * 0.8);
  const nV = Math.round(l.length * 0.1);
  return { treino: l.slice(0, nT), validacao: l.slice(nT, nT + nV), teste: l.slice(nT + nV) };
}

// ---------- execução ----------
const executadoDireto = process.argv[1]?.endsWith("gerar-exemplos-prazos.mts");
if (executadoDireto) {
  const args = process.argv.slice(2);
  const valor = (n: string, padrao: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : padrao);
  const quantidade = Number(valor("--quantidade", "900"));
  const semente = Number(valor("--semente", "7"));
  const saida = valor("--saida", "treino/dados");
  const { exemplos, descartados } = gerar(quantidade, semente);
  const { treino, validacao, teste } = dividir(exemplos, semente);
  mkdirSync(saida, { recursive: true });
  const grava = (nome: string, l: Exemplo[]) => writeFileSync(`${saida}/${nome}.jsonl`, l.map((e) => JSON.stringify(comoConversa(e))).join("\n") + "\n");
  grava("treino", treino);
  grava("validacao", validacao);
  grava("teste", teste);
  const porFamilia: Record<string, number> = {};
  const porTarefa: Record<string, number> = {};
  for (const e of exemplos) {
    porFamilia[e.familia] = (porFamilia[e.familia] ?? 0) + 1;
    porTarefa[e.leitura.tarefa] = (porTarefa[e.leitura.tarefa] ?? 0) + 1;
  }
  writeFileSync(`${saida}/resumo.json`, JSON.stringify({ quantidade: exemplos.length, treino: treino.length, validacao: validacao.length, teste: teste.length, semente, porFamilia, porTarefa, descartados }, null, 2));
  console.log(`Gerados ${exemplos.length} exemplos inventados em ${saida}/ (treino ${treino.length}, validação ${validacao.length}, teste ${teste.length}).`);
  console.log("Por tarefa:", porTarefa);
  if (Object.keys(descartados).length) console.log("Descartados:", descartados);
  console.log("Exemplo:\n" + JSON.stringify(comoConversa(exemplos[0]).messages[1].content) + "\n→ " + comoConversa(exemplos[0]).messages[2].content);
}
