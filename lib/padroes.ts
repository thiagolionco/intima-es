/**
 * Padrões do escritório para a IA: instruções que o escritório escreve uma vez ("como nós
 * trabalhamos") e que a IA segue sempre que faz a tarefa marcada.
 */
export const USO_PADRAO_LABEL = {
  parecer: "Rascunho do parecer",
  risco: "Análise de risco",
  citacoes: "Verificação de citações",
  editor: "Sugestões no editor",
  linha_do_tempo: "Linha do tempo",
  providencias: "Providências",
  tabela: "Revisão em tabela",
  agente: "Assistente do caso",
  pedidos: "Triagem de pedidos",
  monitor: "Monitor de precedentes",
} as const;

export type UsoPadrao = keyof typeof USO_PADRAO_LABEL;

export const USOS_PADRAO = Object.keys(USO_PADRAO_LABEL) as UsoPadrao[];

export type EscopoPadrao = "escritorio" | "pessoal";

export interface PadraoIa {
  id: string;
  nome: string;
  instrucoes: string;
  /** Pessoal: só quem criou vê e só vale para as tarefas dessa pessoa. */
  escopo: EscopoPadrao;
  usos: UsoPadrao[];
  ativo: boolean;
  autorId: string;
  autorNome: string;
  criadoEm: string;
  atualizadoEm: string;
}

export type DadosPadrao = Pick<PadraoIa, "nome" | "instrucoes" | "escopo" | "usos" | "ativo">;

export const LIMITES_PADRAO = { nome: 120, instrucoes: 8000, porEscritorio: 100, caracteresPorTarefa: 20_000 } as const;

/** Padrões prontos, para o escritório adotar e ajustar. */
export const MODELOS_PADRAO: (Omit<DadosPadrao, "escopo" | "ativo"> & { descricao: string })[] = [
  {
    nome: "Parecer interno objetivo",
    descricao: "Estrutura fixa e frases curtas no parecer.",
    usos: ["parecer", "editor"],
    instrucoes:
      "Escreva em português formal, mas direto: frases curtas, sem juridiquês desnecessário.\nComece sempre com uma conclusão de três linhas (\"Em resumo\").\nIndique a chance de êxito em uma de três faixas: remota, possível ou provável, como no pronunciamento contábil CPC 25 para provisões.\nTermine com uma lista numerada de próximos passos, cada um com responsável sugerido.",
  },
  {
    nome: "Triagem de consumidor (verde, amarelo, vermelho)",
    descricao: "Classifica casos de consumo pela viabilidade.",
    usos: ["risco", "pedidos", "tabela"],
    instrucoes:
      "Classifique o caso em:\n- VERDE: falha evidente do fornecedor, documentos suficientes, dano comprovável (ex.: negativação indevida com prova do pagamento).\n- AMARELO: falta prova importante ou há tese contrária forte no STJ.\n- VERMELHO: prescrição provável (art. 27 do CDC, 5 anos para fato do produto ou serviço), ausência de relação de consumo ou valor muito baixo frente ao custo.\nDiga sempre qual documento falta para subir de faixa.",
  },
  {
    nome: "Trabalhista: verbas e prescrição",
    descricao: "Checa prescrição bienal e quinquenal e lista verbas.",
    usos: ["parecer", "risco", "providencias", "tabela"],
    instrucoes:
      "Em casos trabalhistas, confira primeiro a prescrição: 2 anos após o fim do contrato para ajuizar e 5 anos para trás a partir do ajuizamento (art. 7º, XXIX, da CF e art. 11 da CLT).\nListe as verbas pedidas ou devidas separadas por natureza (salarial, indenizatória, rescisória).\nAponte se há necessidade de perícia (insalubridade, periculosidade) e honorários de sucumbência (art. 791-A da CLT).",
  },
  {
    nome: "Linguagem simples para o cliente",
    descricao: "Para textos que vão para o cliente.",
    usos: ["agente", "pedidos"],
    instrucoes:
      "Quando o texto for para o cliente, escreva como numa conversa: sem termos técnicos sem explicação, sem latim, frases de até 20 palavras.\nExplique o que aconteceu, o que vem a seguir e se o cliente precisa fazer algo.\nNunca prometa resultado.",
  },
  {
    nome: "Cronologia para petição",
    descricao: "Fatos com data, fonte e relevância.",
    usos: ["linha_do_tempo"],
    instrucoes:
      "Na linha do tempo, inclua só fatos com data e que importem para o mérito ou para prazos (contratação, inadimplemento, notificações, negativação, demissão, citação, decisões).\nDescreva cada fato em uma frase, no passado, com o valor quando houver.",
  },
  {
    nome: "Providências de início de caso",
    descricao: "Documentos e passos padrão do escritório.",
    usos: ["providencias", "agente"],
    instrucoes:
      "Ao listar providências, inclua sempre que faltar: procuração, declaração de hipossuficiência (se houver pedido de justiça gratuita), comprovante de residência, documentos pessoais e contrato de honorários.\nPrazos sugeridos: 5 dias úteis para documentos do cliente; para atos processuais, siga o CPC e marque [conferir] se não tiver certeza.",
  },
];

const texto = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "");

export function validarPadrao(d: Partial<Record<keyof DadosPadrao, unknown>>): Partial<Record<keyof DadosPadrao, string>> {
  const erros: Partial<Record<keyof DadosPadrao, string>> = {};
  const nome = texto(d.nome);
  const instrucoes = texto(d.instrucoes);
  if (!nome) erros.nome = "Dê um nome ao padrão.";
  else if (nome.length > LIMITES_PADRAO.nome) erros.nome = `Use até ${LIMITES_PADRAO.nome} caracteres.`;
  if (!instrucoes) erros.instrucoes = "Escreva as instruções para a IA.";
  else if (instrucoes.length > LIMITES_PADRAO.instrucoes) erros.instrucoes = `Use até ${LIMITES_PADRAO.instrucoes.toLocaleString("pt-BR")} caracteres.`;
  if (d.escopo !== undefined && d.escopo !== "escritorio" && d.escopo !== "pessoal") erros.escopo = "Escopo inválido.";
  const usos = Array.isArray(d.usos) ? d.usos : [];
  if (!usos.length) erros.usos = "Marque ao menos uma tarefa em que a IA deve seguir este padrão.";
  else if (usos.some((u) => !USOS_PADRAO.includes(u as UsoPadrao))) erros.usos = "Tarefa inválida.";
  return erros;
}

export function normalizarPadrao(d: Partial<Record<keyof DadosPadrao, unknown>>): DadosPadrao {
  return {
    nome: texto(d.nome),
    instrucoes: texto(d.instrucoes),
    escopo: d.escopo === "pessoal" ? "pessoal" : "escritorio",
    usos: USOS_PADRAO.filter((u) => Array.isArray(d.usos) && d.usos.includes(u)),
    ativo: d.ativo !== false,
  };
}

/** Texto que a IA recebe: os padrões ativos para a tarefa, os do escritório antes dos pessoais. */
export function instrucoesDosPadroes(padroes: Pick<PadraoIa, "nome" | "instrucoes" | "escopo" | "usos" | "ativo">[], uso: UsoPadrao): string {
  const aplicaveis = padroes.filter((p) => p.ativo && p.usos.includes(uso)).sort((a, b) => (a.escopo === b.escopo ? 0 : a.escopo === "escritorio" ? -1 : 1));
  let total = 0;
  const partes: string[] = [];
  for (const p of aplicaveis) {
    const bloco = `### ${p.nome}\n${p.instrucoes}`;
    if (total + bloco.length > LIMITES_PADRAO.caracteresPorTarefa) break;
    total += bloco.length;
    partes.push(bloco);
  }
  return partes.join("\n\n");
}

/** Frase pronta para juntar ao pedido da IA (vazia sem padrões). */
export function blocoDosPadroes(instrucoes: string): string {
  return instrucoes
    ? `Padrões do escritório para esta tarefa (siga-os, a menos que contrariem os documentos ou a lei):\n${instrucoes}`
    : "";
}
