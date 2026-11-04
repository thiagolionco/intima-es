/**
 * Agente de Prazos (piloto): a parte que não depende da IA.
 *
 * O agente trabalha em dois papéis, como num escritório:
 *
 * 1. O LEITOR lê a publicação e diz o que ela pede: a tarefa, quantos dias, se conta em dias úteis
 *    ou corridos, se é em dobro e qual trecho do texto sustenta isso. Pode ser a IA
 *    (server/ia/agente-prazos.ts) ou as regras simples do app (`leituraPorRegras`, sem custo).
 * 2. O CONFERENTE (`conferir`) é código comum, sem IA: calcula o vencimento com o calendário do
 *    tribunal (feriados nacionais + dias cadastrados pelo escritório) e confere a leitura contra
 *    o próprio texto. Não deixa passar trecho inventado, número de dias diferente do escrito,
 *    contagem errada para a matéria, dobro sem motivo nem prazo já vencido.
 *
 * A IA nunca conta dias: aritmética de calendário é onde modelos de linguagem mais erram, e o
 * Clepsa já tem um cálculo testado. Nada é gravado aqui: o advogado vê a proposta e confirma.
 * Funções puras, testadas em tests/agente-prazos.test.ts e medidas em scripts/avaliar-agente-prazos.mts.
 */
import type { ContagemPrazo, Intimacao, RegraPrazo, Suspensao } from "../types.ts";
import { sugerirTarefa, TIPOS_TAREFA, type TipoTarefa } from "../tarefas.ts";
import { calcularPrazo, calendarioDa, contagemPadrao, lerPrazoDoTexto, DIAS_MAXIMOS, type ResultadoPrazo } from "./calculo.ts";
import { dataValida } from "./datas.ts";
import { siglaTribunal } from "./tribunais.ts";

export const TIPOS_LEITURA = TIPOS_TAREFA.map((t) => t.tipo);

/** O que o leitor (IA ou regras) entrega. Todos os campos existem sempre: facilita o JSON da IA. */
export interface LeituraPrazo {
  tarefa: TipoTarefa;
  /** Dias do prazo, sem o dobro. 0 quando a publicação não abre prazo (audiência, só ciência). */
  dias: number;
  contagem: ContagemPrazo;
  dobro: boolean;
  /** true: o juízo escreveu o número de dias; false: veio da lei ("prazo legal"). */
  prazoFixado: boolean;
  /** "Fixado pelo juízo" ou o artigo de lei do prazo. */
  fundamento: string;
  /** Cópia literal do trecho da publicação que sustenta a leitura. */
  trecho: string;
  /** Para audiência: AAAA-MM-DD e HH:MM, ou vazio. */
  dataAudiencia: string;
  horaAudiencia: string;
  confianca: "alta" | "media" | "baixa";
  /** Observação curta para o advogado (ou vazio). */
  observacao: string;
}

export type Gravidade = "grave" | "atencao" | "info";

export interface Alerta {
  gravidade: Gravidade;
  /** Código estável, usado nos testes e nas avaliações. */
  codigo: string;
  texto: string;
}

export interface Conferencia {
  /** "confere": nenhum alerta grave; "revisar": o advogado precisa olhar com cuidado antes de confirmar. */
  situacao: "confere" | "revisar";
  alertas: Alerta[];
  /** Regra pronta para gravar se o advogado confirmar (ausente quando não há prazo). */
  regra?: RegraPrazo;
  /** Vencimento calculado pelo Clepsa, com a memória de cálculo. */
  calculo?: ResultadoPrazo;
}

export interface PropostaPrazo {
  leitura: LeituraPrazo;
  conferencia: Conferencia;
  /** Quem leu: "regras" ou o modelo da IA que deu a leitura final. */
  leitor: string;
  /** Quantas leituras foram feitas (2 quando a primeira foi reprovada e o modelo maior releu). */
  tentativas: number;
  /** Modelos usados, na ordem. */
  modelos: string[];
}

export type DadosAgentePrazos = Pick<Intimacao, "texto" | "tribunal" | "classe" | "orgao" | "tipoDocumento" | "tipoComunicacao" | "dataDisponibilizacao"> &
  Partial<Pick<Intimacao, "resumo">>;

/** Sem acentos, minúsculas, sem HTML e com espaços simples, para comparar trechos. */
export function normalizarTexto(s: string): string {
  return (s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[“”"'‘’…]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** O trecho aparece no texto? Tolera reticências e aspas que a IA às vezes acrescenta. */
export function trechoEstaNoTexto(trecho: string, texto: string): boolean {
  const t = normalizarTexto(texto);
  const pedacos = normalizarTexto(trecho.replace(/\.\.\.|…/g, "|"))
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p.length >= 3);
  return pedacos.length > 0 && pedacos.every((p) => t.includes(p));
}

export const SEM_PRAZO: TipoTarefa[] = ["audiencia", "ciencia", "analisar"];
const MENCIONA_DOBRO = /\b(?:em dobro|prazo dobrado|fazenda publica|defensoria|ministerio publico|art(?:igo)?s?\.?\s*(?:180|183|186|229)\b)/;

/** Datas escritas como 12/11/2026 ou 12.11.2026, em AAAA-MM-DD. */
function datasDoTexto(t: string): Set<string> {
  const datas = new Set<string>();
  for (const m of t.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g)) datas.add(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  return datas;
}

/** Prazo gravável a partir da leitura, ou undefined quando não há prazo. */
export function regraDaLeitura(l: LeituraPrazo): RegraPrazo | undefined {
  if (!(l.dias >= 1 && l.dias <= DIAS_MAXIMOS)) return undefined;
  return { dias: Math.floor(l.dias), contagem: l.contagem, dobro: l.dobro, fonte: "usuario", ...(l.trecho ? { trecho: l.trecho.slice(0, 300) } : {}) };
}

/**
 * O conferente: calcula o vencimento e confere a leitura contra o texto e as regras do app.
 * `hoje` (AAAA-MM-DD) serve para avisar de prazo já vencido e audiência no passado.
 */
export function conferir(i: DadosAgentePrazos, l: LeituraPrazo, suspensoes: Suspensao[], hoje: string): Conferencia {
  const alertas: Alerta[] = [];
  const add = (gravidade: Gravidade, codigo: string, texto: string) => alertas.push({ gravidade, codigo, texto });
  const texto = [i.texto, i.resumo?.texto].filter(Boolean).join(" ");
  const t = normalizarTexto(texto);

  // 1. O trecho precisa existir: é a defesa contra a IA "lembrar" de algo que não está escrito.
  if (l.trecho && !trechoEstaNoTexto(l.trecho, texto)) add("grave", "trecho_inexistente", "O trecho citado não aparece na publicação. A leitura pode ter sido inventada.");
  if (!l.trecho && l.dias > 0) add("atencao", "sem_trecho", "A leitura não indicou o trecho que sustenta o prazo.");

  // 2. Número de dias escrito no texto.
  const lido = lerPrazoDoTexto(texto);
  if (l.dias > DIAS_MAXIMOS || l.dias < 0 || !Number.isFinite(l.dias)) add("grave", "dias_invalidos", `Número de dias fora do aceitável (${l.dias}).`);
  if (lido && l.dias > 0 && lido.dias !== l.dias) add("grave", "dias_divergentes", `O texto fala em ${lido.dias} dias (“${lido.trecho}”), mas a leitura deu ${l.dias}.`);
  if (lido && l.dias > 0 && lido.contagem && lido.contagem !== l.contagem)
    add("grave", "contagem_divergente", `O texto diz dias ${lido.contagem === "uteis" ? "úteis" : "corridos"}, mas a leitura deu ${l.contagem === "uteis" ? "úteis" : "corridos"}.`);

  // 3. Contagem certa para a matéria: penal em dias corridos (CPP, art. 798); o resto em dias úteis.
  const padrao = contagemPadrao(i);
  if (l.dias > 0 && !lido?.contagem && padrao !== l.contagem) {
    if (padrao === "corridos") add("grave", "contagem_materia", "Matéria penal conta em dias corridos (CPP, art. 798), mas a leitura deu dias úteis.");
    else add("atencao", "contagem_materia", "Fora da matéria penal a regra é contar em dias úteis (CPC, art. 219; CLT, art. 775). Confira por que a leitura deu dias corridos.");
  }

  // 4. Dobro só com motivo no texto.
  if (l.dobro && !MENCIONA_DOBRO.test(t)) add("atencao", "dobro_sem_motivo", "A leitura contou em dobro, mas o texto não fala de Fazenda Pública, Defensoria, Ministério Público ou prazo em dobro.");
  // Dobro esquecido só antecipa o vencimento (erro do lado seguro): basta um aviso.
  if (!l.dobro && MENCIONA_DOBRO.test(t) && l.dias > 0) add("atencao", "dobro_ignorado", "O texto menciona prazo em dobro, Fazenda Pública, Defensoria ou Ministério Público, mas a leitura não contou em dobro. Confira se a intimada tem esse benefício.");

  // 5. Tarefa sem prazo, ou prazo sem tarefa.
  // Providência sem prazo é o erro mais perigoso: o advogado não seria avisado de nada.
  if (l.dias === 0 && !SEM_PRAZO.includes(l.tarefa)) add("grave", "sem_prazo", "A tarefa pede uma providência, mas a leitura não definiu o prazo. Defina os dias antes de confirmar.");
  const regras = sugerirTarefa(i);
  if (regras.tipo !== "analisar" && regras.tipo !== l.tarefa)
    add("info", "tarefa_divergente", `As regras simples do Clepsa indicariam “${regras.rotulo}”. Confira qual é a providência principal.`);

  // 6. Audiência: data válida e no futuro.
  if (l.tarefa === "audiencia") {
    if (!l.dataAudiencia) add("atencao", "audiencia_sem_data", "Audiência sem data lida: confira no inteiro teor.");
    else if (!dataValida(l.dataAudiencia) || !datasDoTexto(t).has(l.dataAudiencia))
      add("grave", "audiencia_data", `A data da audiência (${l.dataAudiencia}) não aparece no texto.`);
    else if (l.dataAudiencia < hoje) add("atencao", "audiencia_passada", "A data da audiência já passou.");
  }

  if (l.confianca === "baixa") add("atencao", "confianca_baixa", "O leitor disse que tem pouca certeza. Leia o inteiro teor.");

  // 7. Cálculo: quem conta é o Clepsa, com o calendário do tribunal.
  const regra = alertas.some((a) => a.codigo === "dias_invalidos") ? undefined : regraDaLeitura(l);
  const calculo = regra ? (calcularPrazo(i.dataDisponibilizacao, regra, calendarioDa(i, suspensoes)) ?? undefined) : undefined;
  if (regra && !calculo) add("grave", "sem_calculo", "Não foi possível calcular o vencimento (data de disponibilização inválida?).");
  if (calculo && calculo.fim < hoje) add("grave", "vencido", `Pelo cálculo, o prazo venceu em ${calculo.fim.split("-").reverse().join("/")}. Confira já.`);

  // 8. Feriados locais: o Clepsa só conhece os nacionais e os que o escritório cadastrou.
  const sigla = siglaTribunal(i.tribunal);
  if (calculo && /^(TJ|TRT|TRE)/.test(sigla)) {
    const temLocal = suspensoes.some((s) => siglaTribunal(s.tribunal) === sigla && s.fim >= calculo.inicio && s.inicio <= calculo.fim);
    if (!temLocal) add("info", "feriados_locais", `Nenhum feriado ou suspensão do ${sigla} cadastrado no período. Se houver, cadastre em Prazos e avisos: o vencimento muda.`);
  }

  return { situacao: alertas.some((a) => a.gravidade === "grave") ? "revisar" : "confere", alertas, regra, calculo };
}

/** Alertas que uma segunda leitura pode resolver (prazo vencido ou feriado local, não). */
export function pedeReleitura(c: Conferencia, l: LeituraPrazo): boolean {
  return l.confianca === "baixa" || c.alertas.some((a) => a.gravidade === "grave" && a.codigo !== "vencido" && a.codigo !== "sem_calculo");
}

/**
 * O leitor sem IA: as regras que o Clepsa já usa (tarefa sugerida + prazo escrito no texto + prazo
 * usual do CPC). É o ponto de comparação das avaliações e a reserva quando a IA está desligada.
 */
export function leituraPorRegras(i: DadosAgentePrazos): LeituraPrazo {
  const tarefa = sugerirTarefa(i);
  const texto = [i.texto, i.resumo?.texto].filter(Boolean).join(" ");
  const lido = lerPrazoDoTexto(texto);
  const semPrazo = SEM_PRAZO.includes(tarefa.tipo);
  const dias = lido?.dias ?? (semPrazo ? 0 : (tarefa.prazoLegal?.dias ?? 0));
  return {
    tarefa: tarefa.tipo,
    dias,
    contagem: lido?.contagem ?? contagemPadrao(i),
    dobro: /\bem dobro\b/.test(normalizarTexto(texto)),
    prazoFixado: !!lido,
    fundamento: lido ? "Fixado pelo juízo" : (tarefa.prazoLegal?.base ?? ""),
    trecho: lido?.trecho ?? tarefa.trecho ?? "",
    dataAudiencia: tarefa.data ?? "",
    horaAudiencia: tarefa.hora ?? "",
    confianca: lido ? "media" : "baixa",
    observacao: "",
  };
}

/** Confere se o JSON da IA tem o formato certo e devolve uma leitura limpa (ou null). */
export function leituraValida(x: unknown): LeituraPrazo | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const str = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  if (!TIPOS_LEITURA.includes(o.tarefa as TipoTarefa)) return null;
  if (typeof o.dias !== "number" || !Number.isInteger(o.dias)) return null;
  if (o.contagem !== "uteis" && o.contagem !== "corridos") return null;
  const confianca = o.confianca === "alta" || o.confianca === "media" || o.confianca === "baixa" ? o.confianca : "baixa";
  return {
    tarefa: o.tarefa as TipoTarefa,
    dias: o.dias,
    contagem: o.contagem,
    dobro: o.dobro === true,
    prazoFixado: o.prazoFixado === true,
    fundamento: str(o.fundamento, 200),
    trecho: str(o.trecho, 400),
    dataAudiencia: dataValida(str(o.dataAudiencia, 10)) ? str(o.dataAudiencia, 10) : "",
    horaAudiencia: /^\d{2}:\d{2}$/.test(str(o.horaAudiencia, 5)) ? str(o.horaAudiencia, 5) : "",
    confianca,
    observacao: str(o.observacao, 400),
  };
}
