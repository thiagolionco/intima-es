import { IDIOMA_LABEL } from "./editor.ts";
import { FORMATO_PERGUNTA_LABEL, type FormatoPergunta, LIMITES_REVISAO } from "./revisao.ts";

/**
 * Fluxos de IA: uma receita de passos que o escritório monta uma vez (pedido à IA, revisão em
 * tabela, pesquisa, Biblioteca, citações, tradução) e roda com um clique em um ou vários processos.
 * Cada passo recebe o que os anteriores produziram.
 */
export const FERRAMENTA_FLUXO_LABEL = {
  prompt: "Pedido à IA",
  revisao_tabela: "Revisão em tabela",
  pesquisar: "Pesquisar fontes oficiais",
  biblioteca: "Consultar a Biblioteca",
  verificar_citacoes: "Verificar citações",
  traduzir: "Traduzir",
} as const;

export type FerramentaFluxo = keyof typeof FERRAMENTA_FLUXO_LABEL;

export const FERRAMENTAS_FLUXO = Object.keys(FERRAMENTA_FLUXO_LABEL) as FerramentaFluxo[];

export const FERRAMENTA_FLUXO_AJUDA: Record<FerramentaFluxo, string> = {
  prompt: "A IA escreve o que você pedir. Com um processo, lê os PDFs dele; com vários, lê os dados de cada um e o resultado dos passos anteriores.",
  revisao_tabela: "Faz as mesmas perguntas a cada processo escolhido e monta uma tabela, com a página de cada resposta.",
  pesquisar: "Pesquisa leis, súmulas e decisões nos sites oficiais e traz os links.",
  biblioteca: "A IA lê os itens escolhidos da Biblioteca do escritório (modelos, jurisprudência) e responde ao pedido com base neles.",
  verificar_citacoes: "Confere as súmulas, temas, precedentes e artigos citados no texto do passo anterior.",
  traduzir: "Traduz o texto do passo anterior.",
};

/** Ferramentas que pedem uma instrução escrita. */
export const FERRAMENTA_COM_INSTRUCAO: Record<FerramentaFluxo, boolean> = {
  prompt: true,
  revisao_tabela: false,
  pesquisar: true,
  biblioteca: true,
  verificar_citacoes: false,
  traduzir: false,
};

/** Ferramentas cujo resultado é um texto que segue para o próximo passo e pode virar o relatório. */
export const FERRAMENTA_ESCREVE: Record<FerramentaFluxo, boolean> = {
  prompt: true,
  revisao_tabela: false,
  pesquisar: true,
  biblioteca: true,
  verificar_citacoes: false,
  traduzir: true,
};

export interface PerguntaFluxo {
  texto: string;
  formato: FormatoPergunta;
}

export interface PassoFluxo {
  id: string;
  ferramenta: FerramentaFluxo;
  /** O pedido, a pergunta da pesquisa ou a orientação, conforme a ferramenta. */
  instrucao?: string;
  /** Revisão em tabela: as colunas. */
  perguntas?: PerguntaFluxo[];
  /** Biblioteca: itens que a IA lê. */
  bibliotecaIds?: string[];
  /** Tradução: código do idioma (en, es…). */
  idioma?: string;
}

export interface FluxoIa {
  id: string;
  titulo: string;
  /** Vale para todos os passos (o papel da IA, o objetivo, o tom). */
  instrucoes?: string;
  etiquetas: string[];
  /** Rascunho só aparece para quem criou; publicado aparece para o escritório todo. */
  publicado: boolean;
  passos: PassoFluxo[];
  autorId: string;
  autorNome: string;
  criadoEm: string;
  atualizadoEm: string;
}

export type DadosFluxo = Pick<FluxoIa, "titulo" | "instrucoes" | "etiquetas" | "publicado" | "passos">;

export type EstadoPassoExecucao = "pendente" | "rodando" | "feito" | "erro" | "pulado";

export interface ResultadoPasso {
  passoId: string;
  estado: EstadoPassoExecucao;
  /** Andamento dentro do passo (por exemplo, 12 de 52 processos lidos). */
  feitos?: number;
  total?: number;
  resumo?: string;
  /** Texto produzido, que segue para os próximos passos. */
  texto?: string;
  revisaoId?: string;
  fontes?: { titulo: string; url: string }[];
  erro?: string;
  concluidoEm?: string;
}

export type EstadoExecucao = "rodando" | "concluida";

export interface ExecucaoFluxo {
  id: string;
  fluxoId: string;
  fluxoTitulo: string;
  instrucoes?: string;
  /** Cópia dos passos no momento em que rodou (o fluxo pode mudar depois). */
  passos: PassoFluxo[];
  processos: { id: string; rotulo: string }[];
  /** Contexto escrito por quem rodou ("cliente quer acordo", "foco em prescrição"). */
  contexto?: string;
  resultados: ResultadoPasso[];
  estado: EstadoExecucao;
  /** Texto final: o último texto produzido pelos passos. */
  relatorio?: string;
  modelo?: string;
  autorId: string;
  autorNome: string;
  criadoEm: string;
  atualizadoEm: string;
}

export const LIMITES_FLUXO_IA = {
  titulo: 150,
  instrucoes: 4000,
  instrucaoPasso: 2000,
  etiquetas: 8,
  etiqueta: 40,
  passos: 8,
  biblioteca: 10,
  processos: LIMITES_REVISAO.linhas,
  contexto: 4000,
  porEscritorio: 100,
  execucoesPorConta: 50,
  texto: 60_000,
} as const;

const ID = /^[0-9a-f-]{36}$/;

function limpo(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\r\n/g, "\n").trim();
  return t ? t.slice(0, max) : undefined;
}

const novoIdLocal = () => globalThis.crypto.randomUUID();

/** Lê e confere o que a tela mandou. Devolve os dados limpos ou a primeira falha, em português. */
export function validarFluxo(corpo: unknown): { dados: DadosFluxo } | { erro: string; campo: string } {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  const titulo = limpo(c.titulo, LIMITES_FLUXO_IA.titulo);
  if (!titulo) return { erro: "Dê um nome ao fluxo.", campo: "titulo" };
  const etiquetas = [
    ...new Set(
      (Array.isArray(c.etiquetas) ? c.etiquetas : [])
        .flatMap((e) => limpo(e, LIMITES_FLUXO_IA.etiqueta) ?? [])
        .map((e) => e.replace(/\s+/g, " ")),
    ),
  ].slice(0, LIMITES_FLUXO_IA.etiquetas);
  const brutos = Array.isArray(c.passos) ? c.passos : [];
  if (!brutos.length) return { erro: "Adicione ao menos um passo.", campo: "passos" };
  if (brutos.length > LIMITES_FLUXO_IA.passos) return { erro: `Use até ${LIMITES_FLUXO_IA.passos} passos.`, campo: "passos" };
  const passos: PassoFluxo[] = [];
  for (const [i, b] of brutos.entries()) {
    const p = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
    const ferramenta = p.ferramenta as FerramentaFluxo;
    if (!FERRAMENTAS_FLUXO.includes(ferramenta)) return { erro: `Escolha a ferramenta do passo ${i + 1}.`, campo: "passos" };
    const passo: PassoFluxo = { id: typeof p.id === "string" && ID.test(p.id) ? p.id : novoIdLocal(), ferramenta };
    const instrucao = limpo(p.instrucao, LIMITES_FLUXO_IA.instrucaoPasso);
    if (FERRAMENTA_COM_INSTRUCAO[ferramenta] && !instrucao) return { erro: `Escreva o que o passo ${i + 1} deve fazer.`, campo: "passos" };
    if (instrucao) passo.instrucao = instrucao;
    if (ferramenta === "revisao_tabela") {
      const perguntas = (Array.isArray(p.perguntas) ? p.perguntas : []).flatMap((x) => {
        const q = (x ?? {}) as Record<string, unknown>;
        const texto = limpo(q.texto, LIMITES_REVISAO.pergunta);
        return texto ? [{ texto, formato: (q.formato as FormatoPergunta) in FORMATO_PERGUNTA_LABEL ? (q.formato as FormatoPergunta) : "texto" }] : [];
      });
      if (!perguntas.length) return { erro: `Escreva ao menos uma pergunta na tabela do passo ${i + 1}.`, campo: "passos" };
      if (perguntas.length > LIMITES_REVISAO.perguntas) return { erro: `A tabela do passo ${i + 1} aceita até ${LIMITES_REVISAO.perguntas} perguntas.`, campo: "passos" };
      passo.perguntas = perguntas;
    }
    if (ferramenta === "biblioteca") {
      const ids = [...new Set((Array.isArray(p.bibliotecaIds) ? p.bibliotecaIds : []).filter((x): x is string => typeof x === "string" && ID.test(x)))];
      if (!ids.length) return { erro: `Escolha os itens da Biblioteca do passo ${i + 1}.`, campo: "passos" };
      passo.bibliotecaIds = ids.slice(0, LIMITES_FLUXO_IA.biblioteca);
    }
    if (ferramenta === "traduzir") passo.idioma = typeof p.idioma === "string" && IDIOMA_LABEL[p.idioma] ? p.idioma : "en";
    if ((ferramenta === "verificar_citacoes" || ferramenta === "traduzir") && !passos.some((x) => FERRAMENTA_ESCREVE[x.ferramenta])) {
      return { erro: `O passo ${i + 1} trabalha sobre um texto: ponha antes dele um passo que escreva (pedido à IA, pesquisa ou Biblioteca).`, campo: "passos" };
    }
    passos.push(passo);
  }
  return {
    dados: {
      titulo,
      ...(limpo(c.instrucoes, LIMITES_FLUXO_IA.instrucoes) ? { instrucoes: limpo(c.instrucoes, LIMITES_FLUXO_IA.instrucoes) } : {}),
      etiquetas,
      publicado: c.publicado === true,
      passos,
    },
  };
}

/** O fluxo precisa de processos escolhidos para rodar? (A tabela precisa; os outros passos, não.) */
export const exigeProcessos = (passos: PassoFluxo[]) => passos.some((p) => p.ferramenta === "revisao_tabela");

/** Passo da vez: o primeiro que não terminou (pendente, rodando ou com erro). */
export function passoAtual(e: Pick<ExecucaoFluxo, "resultados">): ResultadoPasso | undefined {
  return e.resultados.find((r) => r.estado === "pendente" || r.estado === "rodando" || r.estado === "erro");
}

/** Último texto produzido até o passo dado (exclusive), para o passo seguinte trabalhar sobre ele. */
export function ultimoTexto(e: Pick<ExecucaoFluxo, "passos" | "resultados">, antesDe?: string): string | undefined {
  const fim = antesDe ? e.resultados.findIndex((r) => r.passoId === antesDe) : e.resultados.length;
  for (let i = (fim < 0 ? e.resultados.length : fim) - 1; i >= 0; i--) {
    const r = e.resultados[i];
    const passo = e.passos.find((p) => p.id === r.passoId);
    if (passo && FERRAMENTA_ESCREVE[passo.ferramenta] && r.estado === "feito" && r.texto) return r.texto;
  }
  return undefined;
}

/** Descrição curta do passo, para listas e para a tela de andamento. */
export function descreverPasso(p: PassoFluxo): string {
  if (p.ferramenta === "revisao_tabela") return `${p.perguntas?.length ?? 0} pergunta(s): ${(p.perguntas ?? []).map((q) => q.texto).join(" · ")}`;
  if (p.ferramenta === "traduzir") return `Para o ${IDIOMA_LABEL[p.idioma ?? "en"] ?? "inglês"}`;
  if (p.ferramenta === "verificar_citacoes") return "Confere as citações do texto anterior";
  return p.instrucao ?? "";
}

/** Modelos prontos para o escritório começar e ajustar. */
export const MODELOS_FLUXO: (Omit<DadosFluxo, "publicado" | "passos"> & { descricao: string; passos: Omit<PassoFluxo, "id">[] })[] = [
  {
    titulo: "Carteira com pontos de alerta",
    descricao: "Tabela com as mesmas perguntas para vários processos e um resumo dos que pedem atenção.",
    instrucoes: "Você apoia a gestão de carteira do escritório. Seja objetivo e aponte sempre o processo pelo número.",
    etiquetas: ["Carteira", "Contencioso"],
    passos: [
      {
        ferramenta: "revisao_tabela",
        perguntas: [
          { texto: "Qual o valor da causa ou do dano pedido?", formato: "valor" },
          { texto: "Há pedido de tutela de urgência? Foi deferida?", formato: "texto" },
          { texto: "Há prazo em aberto para o escritório?", formato: "texto" },
          { texto: "Qual o risco para o cliente?", formato: "risco" },
        ],
      },
      {
        ferramenta: "prompt",
        instrucao:
          "Com base na tabela, redija um resumo dos pontos de alerta: processos de risco alto, tutelas deferidas contra o cliente e prazos em aberto. Termine com recomendações em lista numerada.",
      },
    ],
  },
  {
    titulo: "Esboço de contestação",
    descricao: "Lê a inicial, pesquisa a jurisprudência, redige o esboço e confere as citações.",
    instrucoes: "Você é advogado do réu. Escreva em português formal e direto, sem inventar fatos.",
    etiquetas: ["Contencioso", "Peças"],
    passos: [
      { ferramenta: "prompt", instrucao: "Leia a petição inicial e liste os fatos alegados, os pedidos e os documentos juntados, com a página de cada um." },
      { ferramenta: "pesquisar", instrucao: "Quais são as principais teses de defesa e a jurisprudência do STJ sobre os pedidos desta ação?" },
      {
        ferramenta: "prompt",
        instrucao: "Redija o esboço da contestação: preliminares cabíveis, mérito ponto a ponto e pedidos. Use só a jurisprudência encontrada na pesquisa e marque [conferir] onde faltar prova.",
      },
      { ferramenta: "verificar_citacoes" },
    ],
  },
  {
    titulo: "Atualização para cliente estrangeiro",
    descricao: "Resume o andamento em linguagem simples e traduz para o inglês.",
    etiquetas: ["Clientes"],
    passos: [
      {
        ferramenta: "prompt",
        instrucao: "Escreva uma atualização curta do processo para o cliente, em linguagem simples: o que aconteceu, em que pé está, próximos passos e se o cliente precisa fazer algo.",
      },
      { ferramenta: "traduzir", idioma: "en" },
    ],
  },
];
