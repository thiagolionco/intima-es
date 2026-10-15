import type { Intimacao } from "./types.ts";

/** De que lado o cliente do escritório está no processo. */
export type PoloCliente = "ativo" | "passivo";

export const POLO_CLIENTE_LABEL: Record<PoloCliente, string> = {
  ativo: "Autor (polo ativo)",
  passivo: "Réu (polo passivo)",
};

/** Fases do caso no escritório, na ordem do quadro. */
export type FaseProcesso = "triagem" | "elaboracao" | "correcao" | "protocolado";

export const FASES: { id: FaseProcesso; rotulo: string; descricao: string }[] = [
  { id: "triagem", rotulo: "Triagem", descricao: "Atendimento feito, decidindo se e como entrar." },
  { id: "elaboracao", rotulo: "Elaboração da peça", descricao: "Peça sendo redigida." },
  { id: "correcao", rotulo: "Correção de peça", descricao: "Peça pronta, em revisão." },
  { id: "protocolado", rotulo: "Protocolado", descricao: "Já está no tribunal ou no órgão." },
];

export const FASE_LABEL = Object.fromEntries(FASES.map((f) => [f.id, f.rotulo])) as Record<FaseProcesso, string>;

export const AREA_LABEL = {
  trabalhista: "Trabalhista",
  civel: "Cível",
  consumidor: "Consumidor",
  familia: "Família e sucessões",
  previdenciaria: "Previdenciária",
  tributaria: "Tributária",
  empresarial: "Empresarial",
  criminal: "Criminal",
  administrativa: "Administrativa",
  outra: "Outra",
} as const;

export type AreaAtuacao = keyof typeof AREA_LABEL;

export const TIPO_DEMANDA_LABEL = {
  acao: "Ação judicial",
  administrativo: "Processo administrativo",
  defesa: "Defesa",
} as const;

export type TipoDemanda = keyof typeof TIPO_DEMANDA_LABEL;

/** Um processo (ou caso ainda em preparação) do escritório. */
export interface Processo {
  id: string;
  /** Número CNJ só com os 20 dígitos. Obrigatório só depois de protocolado. */
  numero?: string;
  fase: FaseProcesso;
  area?: AreaAtuacao;
  tipo?: TipoDemanda;
  /** Datas em AAAA-MM-DD. */
  dataAtendimento?: string;
  dataInicio?: string;
  prescricao?: string;
  dataProtocolo?: string;
  /** Cidade do juízo. */
  comarca?: string;
  cliente: string;
  parteContraria?: string;
  polo: PoloCliente;
  /** Sigla do tribunal (TJSP, TRT2…). */
  tribunal?: string;
  /** Vara ou órgão julgador. */
  orgao?: string;
  /** Classe processual (tipo de ação). */
  classe?: string;
  /** Valor da causa em centavos. */
  valorCausa?: number;
  /** Pessoa da equipe responsável (id em `preferencias.equipe`). */
  responsavelId?: string;
  observacoes?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export type DadosProcesso = Omit<Processo, "id" | "criadoEm" | "atualizadoEm">;

export type ErrosProcesso = Partial<Record<keyof DadosProcesso, string>>;

export const LIMITES_PROCESSO = { texto: 200, observacoes: 5000, valorMaximo: 1e15 } as const;

const CAMPOS_DATA = ["dataAtendimento", "dataInicio", "prescricao", "dataProtocolo"] as const;

function dataValida(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 && Number(m[1]) >= 1900 && Number(m[1]) <= 2200;
}

/** Quem contra quem: "Cliente × Parte contrária". */
export function referencia(p: Pick<Processo, "cliente" | "parteContraria">): string {
  return p.parteContraria ? `${p.cliente} × ${p.parteContraria}` : p.cliente;
}

/** Dias corridos de `hoje` até a prescrição (negativo se já passou); `undefined` sem data. */
export function diasParaPrescrever(prescricao: string | undefined, hoje: string): number | undefined {
  if (!prescricao || !dataValida(prescricao) || !dataValida(hoje)) return undefined;
  return Math.round((Date.parse(`${prescricao}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000);
}

/** Frase curta para a prescrição. */
export function textoPrescricao(dias: number): string {
  if (dias < 0) return `Prescrito há ${-dias} dia${dias === -1 ? "" : "s"}`;
  if (dias === 0) return "Prescreve hoje";
  return `Prescreve em ${dias} dia${dias === 1 ? "" : "s"}`;
}

/** Faixa de alerta da prescrição: até 30 dias é urgente, até 90 merece atenção. */
export function alertaPrescricao(dias: number | undefined): "vencida" | "urgente" | "atencao" | "ok" | undefined {
  if (dias === undefined) return undefined;
  if (dias < 0) return "vencida";
  if (dias <= 30) return "urgente";
  if (dias <= 90) return "atencao";
  return "ok";
}

export function digitos(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

/** Máscara do número CNJ enquanto se digita: NNNNNNN-DD.AAAA.J.TR.OOOO */
export function mascaraCNJ(v: string): string {
  const d = digitos(v).slice(0, 20);
  const partes = [d.slice(0, 7), d.slice(7, 9), d.slice(9, 13), d.slice(13, 14), d.slice(14, 16), d.slice(16, 20)];
  let out = partes[0];
  if (partes[1]) out += "-" + partes[1];
  for (const p of partes.slice(2)) if (p) out += "." + p;
  return out;
}

/** Resto da divisão por 97 de um número grande escrito em decimal. */
function mod97(n: string): number {
  let r = 0;
  for (const c of n) r = (r * 10 + Number(c)) % 97;
  return r;
}

/**
 * Confere os dígitos verificadores do número CNJ (Resolução CNJ 65/2008):
 * NNNNNNN-DD.AAAA.J.TR.OOOO, com DD = 98 − (NNNNNNN AAAA J TR OOOO 00 mod 97).
 */
export function cnjValido(numero: string): boolean {
  const d = digitos(numero);
  if (d.length !== 20) return false;
  const semDv = d.slice(0, 7) + d.slice(9);
  return 98 - mod97(`${semDv}00`) === Number(d.slice(7, 9));
}

/** Lê "R$ 1.234,56", "1234,5" ou "1234" e devolve centavos; texto vazio é `undefined`, inválido é `null`. */
export function lerValor(texto: string): number | undefined | null {
  const t = (texto ?? "").replace(/R\$|\s/gi, "");
  if (!t) return undefined;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) return null;
  const [inteiro, frac = ""] = t.replace(/\./g, "").split(",");
  return Number(inteiro) * 100 + Number(frac.padEnd(2, "0"));
}

export function formatarValor(centavos?: number): string {
  if (centavos === undefined) return "";
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Validação compartilhada pela tela e pelo servidor. */
export function validarProcesso(d: Partial<Record<keyof DadosProcesso, unknown>>): ErrosProcesso {
  const erros: ErrosProcesso = {};
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (d.fase !== undefined && !FASES.some((f) => f.id === d.fase)) erros.fase = "Fase inválida.";
  if (!digitos(texto(d.numero))) {
    if (faseEfetiva(d) === "protocolado") erros.numero = "Informe o número do processo protocolado.";
  } else if (digitos(texto(d.numero)).length !== 20) erros.numero = "O número CNJ tem 20 dígitos (NNNNNNN-DD.AAAA.J.TR.OOOO).";
  else if (!cnjValido(texto(d.numero))) erros.numero = "Número inválido: os dígitos verificadores não conferem.";
  if (!texto(d.cliente)) erros.cliente = "Informe o cliente.";
  if (d.polo !== "ativo" && d.polo !== "passivo") erros.polo = "Escolha o lado do cliente.";
  if (d.area !== undefined && !(typeof d.area === "string" && d.area in AREA_LABEL)) erros.area = "Área inválida.";
  if (d.tipo !== undefined && !(typeof d.tipo === "string" && d.tipo in TIPO_DEMANDA_LABEL)) erros.tipo = "Tipo inválido.";
  for (const campo of CAMPOS_DATA) {
    const v = d[campo];
    if (v !== undefined && v !== "" && !(typeof v === "string" && dataValida(v))) erros[campo] = "Data inválida.";
  }
  for (const campo of ["cliente", "parteContraria", "tribunal", "orgao", "comarca", "classe", "responsavelId"] as const) {
    if (d[campo] !== undefined && typeof d[campo] !== "string") erros[campo] = "Valor inválido.";
    else if (texto(d[campo]).length > LIMITES_PROCESSO.texto) erros[campo] = `No máximo ${LIMITES_PROCESSO.texto} caracteres.`;
  }
  if (d.observacoes !== undefined && (typeof d.observacoes !== "string" || d.observacoes.length > LIMITES_PROCESSO.observacoes)) {
    erros.observacoes = `No máximo ${LIMITES_PROCESSO.observacoes} caracteres.`;
  }
  if (d.valorCausa !== undefined && (typeof d.valorCausa !== "number" || !Number.isSafeInteger(d.valorCausa) || d.valorCausa < 0 || d.valorCausa > LIMITES_PROCESSO.valorMaximo)) {
    erros.valorCausa = "Valor da causa inválido.";
  }
  return erros;
}

/** Sem fase informada, quem já tem número está protocolado e o resto começa na triagem. */
function faseEfetiva(d: Partial<Record<keyof DadosProcesso, unknown>>): FaseProcesso {
  if (typeof d.fase === "string" && FASES.some((f) => f.id === d.fase)) return d.fase as FaseProcesso;
  return digitos(typeof d.numero === "string" ? d.numero : "") ? "protocolado" : "triagem";
}

/** Normaliza os dados já validados: número só com dígitos, textos aparados, campos vazios removidos. */
export function normalizarProcesso(d: Partial<Record<keyof DadosProcesso, unknown>>): DadosProcesso {
  const opcional = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const r: DadosProcesso = {
    numero: digitos(typeof d.numero === "string" ? d.numero : "") || undefined,
    fase: faseEfetiva(d),
    area: opcional(d.area) as AreaAtuacao | undefined,
    tipo: opcional(d.tipo) as TipoDemanda | undefined,
    dataAtendimento: opcional(d.dataAtendimento),
    dataInicio: opcional(d.dataInicio),
    prescricao: opcional(d.prescricao),
    dataProtocolo: opcional(d.dataProtocolo),
    comarca: opcional(d.comarca),
    cliente: String(d.cliente).trim(),
    parteContraria: opcional(d.parteContraria),
    polo: d.polo as PoloCliente,
    tribunal: opcional(d.tribunal)?.toUpperCase(),
    orgao: opcional(d.orgao),
    classe: opcional(d.classe),
    valorCausa: typeof d.valorCausa === "number" ? d.valorCausa : undefined,
    responsavelId: opcional(d.responsavelId),
    observacoes: opcional(d.observacoes),
  };
  return Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) as DadosProcesso;
}

/** Intimações do processo, ligadas pelo número CNJ, da mais recente para a mais antiga. */
export function intimacoesDoProcesso(intimacoes: Intimacao[], numero: string | undefined): Intimacao[] {
  const alvo = digitos(numero ?? "");
  if (!alvo) return [];
  return intimacoes
    .filter((i) => digitos(i.numeroProcesso) === alvo)
    .sort((a, b) => b.dataDisponibilizacao.localeCompare(a.dataDisponibilizacao));
}

/** PDF anexado a um processo. Os bytes ficam no armazenamento de arquivos; aqui só os metadados. */
export interface DocumentoProcesso {
  id: string;
  processoId: string;
  /** Nome do arquivo como foi enviado. */
  nome: string;
  /** Em bytes. */
  tamanho: number;
  /** sha256 do conteúdo, para não guardar o mesmo PDF duas vezes no processo. */
  hash: string;
  criadoEm: string;
}

export const LIMITES_DOCUMENTO = { bytes: 30 * 1024 * 1024, porProcesso: 200 } as const;

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

/** Uma versão do parecer do processo. Cada gravação cria uma versão nova; nenhuma é apagada. */
export interface ParecerProcesso {
  id: string;
  processoId: string;
  /** 1, 2, 3… dentro do processo. */
  versao: number;
  texto: string;
  autorId: string;
  /** Nome do autor quando escreveu (continua lá mesmo se ele sair do escritório). */
  autorNome: string;
  criadoEm: string;
}

export const LIMITES_PARECER = { caracteres: 50_000, versoes: 500 } as const;

export type NivelRisco = "baixo" | "medio" | "alto" | "indeterminado";

export const NIVEL_RISCO_LABEL: Record<NivelRisco, string> = {
  baixo: "Risco baixo",
  medio: "Risco médio",
  alto: "Risco alto",
  indeterminado: "Risco indeterminado",
};

/** Um ponto da análise, sempre com a página do PDF em que se apoia. */
export interface PontoAnalise {
  texto: string;
  documentoId: string;
  documentoNome: string;
  pagina: number;
}

/** Análise de risco feita pela IA a partir dos PDFs do processo. Cada análise fica guardada. */
export interface AnaliseRisco {
  id: string;
  processoId: string;
  nivel: NivelRisco;
  justificativa: string;
  pontosFortes: PontoAnalise[];
  pontosFracos: PontoAnalise[];
  /** PDFs que a IA leu nesta análise. */
  documentos: { id: string; nome: string }[];
  modelo: string;
  autorId: string;
  autorNome: string;
  criadoEm: string;
}

/** Um andamento do processo, como o tribunal informou ao DataJud (CNJ). */
export interface Movimentacao {
  dataHora: string;
  /** Código da tabela processual unificada do CNJ. */
  codigo?: number;
  nome: string;
  /** Complementos tabelados (ex.: "tipo de conclusão: para despacho"). */
  complementos?: string[];
  /** Grau em que aconteceu (G1, G2, JE…), quando o processo tem mais de um. */
  grau?: string;
  orgao?: string;
}

/** Última consulta do processo no DataJud, com os andamentos da mais nova para a mais antiga. */
export interface MovimentacoesProcesso {
  processoId: string;
  /** Quando o Clepsa consultou o DataJud pela última vez. */
  consultadoEm: string;
  /** Se o DataJud tem o processo. */
  encontrado: boolean;
  /** Última atualização do processo no DataJud (o tribunal envia com atraso de dias). */
  atualizadoNoTribunal?: string;
  movimentos: Movimentacao[];
  /** Falha da última consulta; os andamentos são os da consulta anterior que deu certo. */
  erro?: string;
}

/** Resumo para a lista de processos. */
export type UltimaMovimentacao = Pick<Movimentacao, "dataHora" | "nome">;

/** Andamentos dos últimos dias aparecem como novos. */
export const DIAS_MOVIMENTACAO_NOVA = 7;
