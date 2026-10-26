/**
 * Tarefa sugerida: lê a publicação e indica o tipo de providência (contestar, réplica, audiência…).
 *
 * Versão simples, por regras: procura expressões típicas de despachos, decisões e sentenças no
 * inteiro teor (e no resumo automático, quando houver). Nada é gravado: a sugestão é recalculada
 * a cada exibição, então melhorar as regras vale também para as intimações antigas.
 * Funções puras, testadas em tests/tarefas.test.ts.
 */
import type { Intimacao } from "./types.ts";

export type TipoTarefa =
  | "audiencia"
  | "contrarrazoar"
  | "replica"
  | "contestar"
  | "emendar"
  | "pagar"
  | "pericia"
  | "alegacoes_finais"
  | "especificar_provas"
  | "custas"
  | "avaliar_recurso"
  | "juntar_documentos"
  | "manifestar"
  | "ciencia"
  | "analisar";

export type TomTarefa = "audiencia" | "acao" | "ciencia" | "analisar";

/** Prazo que a lei costuma dar para esse ato. Só uma referência: vale o que o juízo fixou. */
export interface PrazoLegal {
  dias: number;
  base: string;
}

interface Definicao {
  tipo: TipoTarefa;
  rotulo: string;
  /** O que fazer, em uma frase. */
  acao: string;
  tom: TomTarefa;
  /** Prazo do CPC; não é mostrado em processos trabalhistas nem penais, que têm regras próprias. */
  prazoLegal?: PrazoLegal;
  padroes: RegExp[];
  /** Quando o que vem logo antes da expressão casa com isto, ela não conta ("realizada a audiência…"). */
  excecao?: RegExp;
  /** Tipo de documento ou de comunicação do DJEN que, sozinho, já indica esta tarefa. */
  documentos?: RegExp;
}

/** Em ordem de prioridade: quando o texto pede mais de uma coisa, vale a primeira da lista. */
const DEFINICOES: Definicao[] = [
  {
    tipo: "audiencia",
    rotulo: "Audiência",
    acao: "Anotar a audiência na agenda, avisar o cliente e preparar a participação.",
    tom: "audiencia",
    padroes: [
      /\bdesign(?:o|a-se|ada|ando)\s+(?:a\s+)?(?:nova\s+)?audiencia/,
      /\baudiencia\s+(?:de\s+|una\b|inicial\b|telepresencial\b|virtual\b|por\s+videoconferencia\b)(?:conciliacao|instrucao|mediacao|julgamento|custodia|justificacao|una|inicial|telepresencial|virtual|videoconferencia)?/,
      /\b(?:redesign|remarc|reagend)\w*\s+(?:a\s+)?audiencia/,
      /\bsessao\s+de\s+(?:conciliacao|mediacao)\b/,
      /\bpauta\s+(?:de\s+)?(?:audiencia|julgamento)\b/,
    ],
    excecao: /(?:realizad[ao]s?|ata\s+d[ae]|termo\s+d[ae]|aberta\s+a|encerrad[ao]|durante|apos|depois\s+d[ao])\s+(?:a\s+)?$/,
  },
  {
    tipo: "contrarrazoar",
    rotulo: "Contrarrazões",
    acao: "Apresentar contrarrazões ao recurso da outra parte.",
    tom: "acao",
    prazoLegal: { dias: 15, base: "CPC, arts. 1.003, § 5º, e 1.010, § 1º" },
    padroes: [/\bcontrarraz/, /\bcontra-?\s?razoes\b/, /\bcontraminuta\b/, /\bresposta\s+ao\s+(?:recurso|agravo)\b/],
  },
  {
    tipo: "replica",
    rotulo: "Réplica",
    acao: "Apresentar réplica à contestação.",
    tom: "acao",
    prazoLegal: { dias: 15, base: "CPC, arts. 350 e 351" },
    padroes: [/\breplica\b/, /\bimpugna(?:cao|r)\s+(?:a|da)\s+contestacao\b/, /\bmanifest\w*\s+(?:-se\s+)?(?:\w+\s+){0,4}sobre\s+a\s+contestacao\b/, /\bsobre\s+a\s+contestacao\b/],
  },
  {
    tipo: "contestar",
    rotulo: "Contestar",
    acao: "Preparar e protocolar a contestação.",
    tom: "acao",
    prazoLegal: { dias: 15, base: "CPC, art. 335" },
    padroes: [/\bcite-se\b/, /\bcitad[oa]s?\s+para\b/, /\b(?:apresentar|oferecer|ofertar)\s+(?:a\s+)?(?:sua\s+)?(?:contestacao|defesa)\b/, /\bprazo\s+para\s+(?:contestar|contestacao|defesa)\b/, /\bcontestar\s+(?:a\s+)?(?:acao|o\s+pedido)\b/],
    documentos: /^citacao\b/,
  },
  {
    tipo: "emendar",
    rotulo: "Emendar a inicial",
    acao: "Emendar ou completar a petição inicial, sob pena de indeferimento.",
    tom: "acao",
    prazoLegal: { dias: 15, base: "CPC, art. 321" },
    padroes: [/\bemend(?:e|a|ar|em)\b(?:\s+\w+){0,4}\s+(?:a\s+)?(?:peticao\s+)?inicial\b/, /\bemenda\s+(?:a|da)\s+(?:peticao\s+)?inicial\b/, /\bsob\s+pena\s+de\s+indeferimento\s+da\s+(?:peticao\s+)?inicial\b/],
  },
  {
    tipo: "pagar",
    rotulo: "Pagamento",
    acao: "Avisar o cliente e pagar o débito (ou apresentar impugnação), para evitar multa e penhora.",
    tom: "acao",
    prazoLegal: { dias: 15, base: "CPC, arts. 523 e 525" },
    padroes: [/\bart(?:igo)?\.?\s*523\b/, /\b(?:pagar|pague|paguem|efetue\s+o\s+pagamento\s+d[oa])\s+(?:o\s+|a\s+)?(?:debito|divida|quantia|valor\s+devido|condenacao)\b/, /\bpagamento\s+voluntario\b/, /\bpara\s+(?:o\s+)?pagamento\b[^.;]{0,60}?\bsob\s+pena\s+de\s+(?:penhora|multa)/, /\bsob\s+pena\s+de\s+multa\s+de\s+(?:dez|10)\s*(?:%|por\s+cento)/],
  },
  {
    tipo: "pericia",
    rotulo: "Perícia",
    acao: "Indicar assistente técnico e quesitos, ou se manifestar sobre o laudo.",
    tom: "acao",
    prazoLegal: { dias: 15, base: "CPC, arts. 465, § 1º, e 477, § 1º" },
    padroes: [/\bquesitos\b/, /\bassistentes?\s+tecnicos?\b/, /\blaudo\s+pericial\b/, /\bsobre\s+o\s+laudo\b/, /\bhonorarios\s+periciais\b/, /\bnomeio\s+(?:como\s+)?perit[oa]\b/],
  },
  {
    tipo: "alegacoes_finais",
    rotulo: "Alegações finais",
    acao: "Apresentar alegações finais (memoriais).",
    tom: "acao",
    prazoLegal: { dias: 15, base: "CPC, art. 364, § 2º" },
    padroes: [/\balegacoes\s+finais\b/, /\bmemoriais\b/, /\brazoes\s+finais\b/],
  },
  {
    tipo: "especificar_provas",
    rotulo: "Especificar provas",
    acao: "Dizer quais provas pretende produzir e justificar a necessidade.",
    tom: "acao",
    padroes: [/\bespecifi(?:quem|que|car|cacao\s+de)\s+(?:as\s+)?provas\b/, /\bprovas\s+que\s+(?:ainda\s+)?pretende/, /\bindiqu?(?:em|e)\s+(?:as\s+)?provas\b/],
  },
  {
    tipo: "custas",
    rotulo: "Custas",
    acao: "Recolher as custas ou o preparo e juntar a guia paga.",
    tom: "acao",
    padroes: [/\brecolh(?:er|a|am|imento)\s+(?:\w+\s+){0,4}?(?:custas|preparo|taxa\s+judiciaria|diligencias?)\b/, /\bcomplement(?:ar|e|em|acao)\s+(?:\w+\s+){0,4}?(?:custas|preparo)\b/, /\bguias?\s+de\s+(?:custas|recolhimento)\b/, /\bdeserca?o\b/, /\bcustas\s+(?:iniciais|processuais)\s+(?:em\s+aberto|nao\s+recolhidas|pendentes)\b/],
  },
  {
    tipo: "avaliar_recurso",
    rotulo: "Avaliar recurso",
    acao: "Ler a decisão, avisar o cliente e decidir se cabe recurso (ou embargos de declaração).",
    tom: "acao",
    prazoLegal: { dias: 15, base: "CPC, art. 1.003, § 5º (embargos de declaração: 5 dias, art. 1.023)" },
    padroes: [
      /\bjulgo\s+(?:totalmente\s+|parcialmente\s+)?(?:procedente|improcedente|extint)/,
      /\bjulgo\s+(?:o\s+processo\s+)?extinto\b/,
      /\bhomologo\s+(?:por\s+sentenca\s+)?o\s+acordo\b/,
      /\bacordam\s+(?:os|as)\s+(?:desembargador|ministr|juiz|membros)/,
      /\b(?:dou|nego|negar|dar|deram|negaram)\s+(?:parcial\s+)?provimento\b/,
      /\b(?:defiro|indefiro)\s+(?:o\s+pedido\s+de\s+|a\s+|o\s+)?(?:tutela|liminar|antecipacao)/,
    ],
    documentos: /^(?:sentenca|acordao)/,
  },
  {
    tipo: "juntar_documentos",
    rotulo: "Juntar documentos",
    acao: "Juntar aos autos os documentos ou comprovantes pedidos.",
    tom: "acao",
    padroes: [/\bjunt(?:e|em|ar|ada\s+de)\s+(?:aos\s+autos\s+)?(?:o|a|os|as|cop|document|comprovante|procuracao|certid|instrumento)/, /\bregularize\s+a\s+representacao\b/, /\b(?:traga|tragam|trazer)\s+aos\s+autos\b/, /\bcomprov(?:e|em|ar)\s+(?:documentalmente\s+|nos\s+autos\s+)?(?:o|a|os|as)\b/],
  },
  {
    tipo: "manifestar",
    rotulo: "Manifestação",
    acao: "Peticionar se manifestando sobre o que foi determinado.",
    tom: "acao",
    prazoLegal: { dias: 5, base: "CPC, art. 218, § 3º, quando o juízo não fixa prazo" },
    padroes: [/\bmanifest(?:e|em|ar|acao)\b/, /\b(?:de-se|abra-se|com)\s+vista\b/, /\bvista\s+(?:as|a|ao|aos)\s+(?:partes?|autor|reu|requerent|requerid|exequent|executad)/, /\bdiga(?:m)?\s+(?:a|o|as|os)\s+(?:parte|autor|reu|requerent|requerid|exequent|executad)/, /\bfale(?:m)?\s+(?:a|o)\s+(?:parte|autor|reu)/, /\b(?:intime|intimem|intima)-?se\s+(?:a|o|as|os)\s+(?:parte|autor|reu|requerent|requerid|exequent|executad)\w*\s+para\b/],
  },
  {
    tipo: "ciencia",
    rotulo: "Só ciência",
    acao: "Sem providência aparente: tomar ciência e arquivar a intimação.",
    tom: "ciencia",
    padroes: [/\barquiv(?:em|e)-se\b/, /\btransit(?:o|ou|ada)\s+em\s+julgado\b/, /\bremet(?:am|a)-se\b/, /\bredistribu/, /\bconclusos?\b/, /\baguarde-se\b/, /\bsuspend(?:o|e-se)\s+o\s+(?:processo|feito|curso)\b/, /\bpara\s+ciencia\b/, /\bciencia\s+(?:as|a|ao|aos)\s+partes?\b/, /\bbaixa\s+(?:dos\s+autos|definitiva)\b/, /\bmero\s+expediente\b/],
  },
];

const ANALISAR: Definicao = {
  tipo: "analisar",
  rotulo: "Analisar",
  acao: "Ler o inteiro teor e definir a providência.",
  tom: "analisar",
  padroes: [],
};

const POR_TIPO = new Map<TipoTarefa, Definicao>([...DEFINICOES, ANALISAR].map((d) => [d.tipo, d]));

/** Tipos na ordem em que aparecem nos filtros. */
export const TIPOS_TAREFA: { tipo: TipoTarefa; rotulo: string }[] = [...DEFINICOES, ANALISAR].map(({ tipo, rotulo }) => ({ tipo, rotulo }));

export function rotuloTarefa(tipo: TipoTarefa): string {
  return POR_TIPO.get(tipo)?.rotulo ?? tipo;
}

export interface TarefaSugerida {
  tipo: TipoTarefa;
  rotulo: string;
  acao: string;
  tom: TomTarefa;
  /** Trecho do texto que levou à sugestão; ausente quando veio só do tipo de documento ou não houve pista. */
  trecho?: string;
  /** Prazo que a lei costuma dar, quando a matéria segue o CPC. */
  prazoLegal?: PrazoLegal;
  /** Para audiência: data (AAAA-MM-DD) e hora (HH:MM) encontradas perto da menção. */
  data?: string;
  hora?: string;
  /** Outras providências que o texto também parece pedir, em ordem de prioridade. */
  outras: TipoTarefa[];
}

export type DadosTarefa = Pick<Intimacao, "texto" | "tipoDocumento" | "tipoComunicacao" | "tribunal" | "classe" | "orgao"> & Partial<Pick<Intimacao, "resumo">>;

/** Texto sem marcação HTML e com espaços simples, como o advogado lê. */
function plano(s: string | undefined): string {
  return (s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFC");
}

/** Sem acentos e em minúsculas, com o mesmo comprimento de `plano`, para as posições valerem nos dois. */
function normalizar(s: string | undefined): string {
  return plano(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Justiça do Trabalho, juizados e matéria penal têm prazos próprios: o prazo do CPC não é sugerido. */
function regimeProprio(i: DadosTarefa): boolean {
  if (/^(?:trt|tst)/i.test(i.tribunal ?? "")) return true;
  return /\b(?:penal|criminal|crime|habeas corpus|inquerito|execucao da pena|juri|trabalh|juizado)/.test(normalizar(`${i.classe} ${i.orgao}`));
}

/** Recorta o trecho em volta da expressão encontrada, sem cortar palavras. */
function recorte(t: string, inicio: number, fim: number): string {
  let a = Math.max(0, inicio - 40);
  let b = Math.min(t.length, fim + 60);
  if (a > 0) a = t.indexOf(" ", a) + 1 || a;
  if (b < t.length) b = t.lastIndexOf(" ", b) > fim ? t.lastIndexOf(" ", b) : b;
  return `${a > 0 ? "…" : ""}${t.slice(a, b).trim()}${b < t.length ? "…" : ""}`;
}

/** Data e hora da audiência: a primeira data depois da menção, nos 200 caracteres seguintes. */
function dataDaAudiencia(t: string, desde: number): { data?: string; hora?: string } {
  const janela = t.slice(desde, desde + 200);
  const d = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/.exec(janela);
  if (!d) return {};
  const [dia, mes, ano] = [Number(d[1]), Number(d[2]), Number(d[3])];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return {};
  const data = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  const h = /\b(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*(?:min|h)?\b/.exec(janela.slice(d.index + d[0].length, d.index + d[0].length + 40));
  const hora = h && Number(h[1]) < 24 ? `${h[1].padStart(2, "0")}:${h[2] ?? "00"}` : undefined;
  return { data, hora };
}

/** A ocorrência mais cedo no texto de qualquer padrão da definição, ignorando as exceções. */
function primeiraOcorrencia(t: string, def: Definicao): RegExpExecArray | null {
  let melhor: RegExpExecArray | null = null;
  for (const padrao of def.padroes) {
    const re = new RegExp(padrao.source, "g");
    for (let m = re.exec(t); m; m = re.exec(t)) {
      if (melhor && m.index >= melhor.index) break;
      if (def.excecao?.test(t.slice(Math.max(0, m.index - 30), m.index))) continue;
      melhor = m;
      break;
    }
  }
  return melhor;
}

const cache = new WeakMap<object, TarefaSugerida>();

/** Indica a tarefa que a publicação pede. Sempre devolve algo: na falta de pista, "Analisar". */
export function sugerirTarefa(i: DadosTarefa): TarefaSugerida {
  const guardada = cache.get(i);
  if (guardada) return guardada;

  const original = plano([i.texto, i.resumo?.texto].filter(Boolean).join(" "));
  const t = normalizar(original);
  // Por segurança: se a normalização mudou o comprimento, o trecho sai sem acentos, mas no lugar certo.
  const fonte = original.length === t.length ? original : t;
  const documentos = [normalizar(i.tipoDocumento), normalizar(i.tipoComunicacao)];
  const achados: { def: Definicao; inicio?: number; fim?: number }[] = [];
  for (const def of DEFINICOES) {
    const m = primeiraOcorrencia(t, def);
    if (m) achados.push({ def, inicio: m.index, fim: m.index + m[0].length });
    else if (def.documentos && documentos.some((d) => def.documentos!.test(d))) achados.push({ def });
  }

  const [principal, ...resto] = achados;
  const def = principal?.def ?? ANALISAR;
  const r: TarefaSugerida = {
    tipo: def.tipo,
    rotulo: def.rotulo,
    acao: def.acao,
    tom: def.tom,
    trecho: principal?.inicio !== undefined ? recorte(fonte, principal.inicio, principal.fim!) : undefined,
    prazoLegal: def.prazoLegal && !regimeProprio(i) ? def.prazoLegal : undefined,
    outras: resto.map((a) => a.def.tipo).filter((x) => x !== "ciencia").slice(0, 3),
    ...(def.tipo === "audiencia" && principal?.inicio !== undefined ? dataDaAudiencia(t, principal.inicio) : {}),
  };
  cache.set(i, r);
  return r;
}
