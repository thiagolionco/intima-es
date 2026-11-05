/**
 * Aba News: fontes oficiais e o guia de curadoria. Tudo aqui é fonte primária (tribunais
 * superiores, CNJ, Imprensa Nacional, Planalto, Congresso). Agregadores e doutrina ficam de fora
 * de propósito: servem para achar, nunca para fundamentar.
 *
 * Links conferidos em 2026-11-05. Os marcados `conferido: false` existem no site oficial, mas o
 * site recusa leitura automática (robots.txt ou firewall), então a conferência é manual.
 */

export type EixoId = "stf" | "stj" | "normativo" | "monitoramento";

/** Natureza do que o feed publica, para não confundir sinal com fundamento. */
export type Natureza = "jurisprudencia" | "noticia" | "plenario" | "legislativo";

export interface FonteFeed {
  id: string;
  nome: string;
  orgao: string;
  eixo: EixoId;
  natureza: Natureza;
  url: string;
  /** Página oficial para abrir quando o feed estiver fora do ar. */
  pagina: string;
}

export const NATUREZA: Record<Natureza, { rotulo: string; aviso: string }> = {
  jurisprudencia: { rotulo: "Jurisprudência oficial", aviso: "Publicação oficial do tribunal. Ainda assim, cite o acórdão, não o informativo." },
  noticia: { rotulo: "Notícia institucional", aviso: "Sinal de pauta. Não serve de fundamento: localize o acórdão ou a ata." },
  plenario: { rotulo: "Sessão e transmissão", aviso: "Debate em curso (in itinere). A tese só vale depois de publicada." },
  legislativo: { rotulo: "Norma em formação", aviso: "Projeto ou tramitação. Só vale como lei depois de sancionada e publicada no DOU." },
};

export const FEEDS: FonteFeed[] = [
  {
    id: "stj-informativo",
    nome: "Informativo de Jurisprudência",
    orgao: "STJ",
    eixo: "stj",
    natureza: "jurisprudencia",
    url: "https://processo.stj.jus.br/jurisprudencia/externo/InformativoFeed",
    pagina: "https://scon.stj.jus.br/SCON/jt/",
  },
  {
    id: "stj-teses",
    nome: "Jurisprudência em Teses",
    orgao: "STJ",
    eixo: "stj",
    natureza: "jurisprudencia",
    url: "https://scon.stj.jus.br/SCON/JurisprudenciaEmTesesFeed",
    pagina: "https://scon.stj.jus.br/SCON/jt/",
  },
  {
    id: "stj-pesquisa-pronta",
    nome: "Pesquisa Pronta",
    orgao: "STJ",
    eixo: "stj",
    natureza: "jurisprudencia",
    url: "https://scon.stj.jus.br/SCON/PesquisaProntaFeed",
    pagina: "https://scon.stj.jus.br/SCON/sumstj/",
  },
  {
    id: "stf-noticias",
    nome: "Notícias do STF",
    orgao: "STF",
    eixo: "stf",
    natureza: "noticia",
    url: "https://noticias.stf.jus.br/feed/",
    pagina: "https://portal.stf.jus.br/textos/verTexto.asp?servico=informativoSTF",
  },
  {
    id: "stj-noticias",
    nome: "Notícias do STJ",
    orgao: "STJ",
    eixo: "stj",
    natureza: "noticia",
    url: "https://res.stj.jus.br/hrestp-c-portalp/RSS.xml",
    pagina: "https://www.stj.jus.br/sites/portalp/Paginas/RSS.aspx",
  },
  {
    id: "stf-videos",
    nome: "Sessões e vídeos do STF",
    orgao: "STF",
    eixo: "monitoramento",
    natureza: "plenario",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCsW4QSB1USsu9ouuFUWe4Iw",
    pagina: "https://www.youtube.com/@STF_oficial",
  },
  {
    id: "stj-videos",
    nome: "Sessões e vídeos do STJ",
    orgao: "STJ",
    eixo: "monitoramento",
    natureza: "plenario",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCfO_b7sApXI23VnsljvSAJg",
    pagina: "https://www.youtube.com/@STJnoticias",
  },
  {
    id: "camara-justica",
    nome: "Câmara · Direito e Justiça",
    orgao: "Câmara dos Deputados",
    eixo: "normativo",
    natureza: "legislativo",
    url: "https://www.camara.leg.br/noticias/rss/dinamico/DIREITO-E-JUSTICA",
    pagina: "https://www.camara.leg.br/noticias/rss",
  },
];

/** Domínios aceitos nos links dos itens. Qualquer outro é descartado. */
export const DOMINIOS_OFICIAIS = ["stf.jus.br", "stj.jus.br", "cnj.jus.br", "jus.br", "gov.br", "leg.br", "youtube.com", "youtu.be"];

export function linkOficial(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return DOMINIOS_OFICIAIS.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export interface FonteGuia {
  nome: string;
  url: string;
  /** O que essa fonte responde. */
  serve: string;
  /** Como usar com rigor. */
  como: string[];
  conferido: boolean;
}

export interface EixoGuia {
  id: EixoId;
  numero: number;
  titulo: string;
  objetivo: string;
  fontes: FonteGuia[];
  /** Checagem obrigatória antes de usar algo deste eixo numa peça. */
  checagem: string[];
}

export const EIXOS: EixoGuia[] = [
  {
    id: "stf",
    numero: 1,
    titulo: "Jurisdição constitucional e controle de constitucionalidade (STF)",
    objetivo: "Saber o que vincula: tese de repercussão geral, súmula vinculante e decisão em controle concentrado com eficácia erga omnes. O resto é persuasivo.",
    fontes: [
      {
        nome: "Portal de Jurisprudência do STF",
        url: "https://jurisprudencia.stf.jus.br/pages/search",
        serve: "Acórdãos, decisões monocráticas, súmulas e repercussão geral numa só base.",
        como: [
          "Escolha a base antes de buscar: Acórdãos, Decisões monocráticas, Repercussão geral, Súmulas. Misturar bases mistura força vinculante.",
          "Use aspas para expressão exata e o operador \"E\" / \"OU\" do próprio portal; filtre por órgão julgador (Plenário x Turmas).",
          "Monocrática não vincula e pode ser revista em agravo: confira se houve agravo regimental e o resultado.",
          "Leia ementa, tese e dispositivo. Ementa resume, mas o que vincula é a tese fixada e a ratio do voto condutor.",
          "Anote data do julgamento e data de publicação do acórdão (DJe). Embargos de declaração podem modular efeitos.",
        ],
        conferido: true,
      },
      {
        nome: "Repercussão Geral",
        url: "https://portal.stf.jus.br/repercussaogeral/",
        serve: "Temas com mérito julgado, repercussão reconhecida pendente de mérito, e temas sem repercussão (admissibilidade negada).",
        como: [
          "Classifique o tema: mérito julgado (tese vinculante, arts. 927, III, e 1.040 do CPC), repercussão reconhecida e mérito pendente (pode haver suspensão nacional, art. 1.035, § 5º) ou repercussão negada (inadmissão em massa).",
          "Copie o texto da tese da página de teses, nunca de notícia: https://portal.stf.jus.br/repercussaogeral/teses.asp",
          "Confira se houve modulação de efeitos e a partir de quando a tese se aplica.",
          "Verifique determinação de suspensão nacional dos processos que tratam do tema e o seu caso concreto.",
        ],
        conferido: true,
      },
      {
        nome: "Informativo STF",
        url: "https://portal.stf.jus.br/textos/verTexto.asp?servico=informativoSTF",
        serve: "Resumo semanal dos julgamentos concluídos, inclusive do Plenário Virtual, com as teses fixadas.",
        como: [
          "Use para descobrir; cite o acórdão publicado. Informativo não é repositório oficial de jurisprudência.",
          "Separe julgamento concluído de julgamento suspenso (pedido de vista ou destaque): só o concluído forma tese.",
          "Destaque no Plenário Virtual reinicia o julgamento no presencial; voto já lançado pode mudar.",
        ],
        conferido: true,
      },
      {
        nome: "Súmulas Vinculantes",
        url: "https://portal.stf.jus.br/jurisprudencia/sumariosumulas.asp?base=26",
        serve: "Lista oficial com redação vigente, revisões e cancelamentos (art. 103-A da CF e Lei 11.417/2006).",
        como: [
          "Antes de citar, confirme que a súmula não está cancelada ou revisada.",
          "Descumprimento de súmula vinculante por juízo ou administração abre reclamação (art. 103-A, § 3º, da CF; art. 988 do CPC).",
          "Leia os precedentes que originaram a súmula: o alcance dela é o desses casos.",
        ],
        conferido: true,
      },
    ],
    checagem: [
      "A tese é de mérito de repercussão geral, súmula vinculante ou controle concentrado? Se não, trate como persuasiva.",
      "Há embargos de declaração pendentes ou modulação de efeitos?",
      "A tese foi superada ou revisada depois (overruling)? Busque o número do tema e o da súmula na base de acórdãos recentes.",
    ],
  },
  {
    id: "stj",
    numero: 2,
    titulo: "Uniformização do direito infraconstitucional (STJ)",
    objetivo: "Identificar tese de recurso repetitivo (vinculante, art. 927, III, do CPC), súmula e posição consolidada por seção, e perceber cedo viradas e distinções.",
    fontes: [
      {
        nome: "SCON · Pesquisa de jurisprudência do STJ",
        url: "https://scon.stj.jus.br/SCON/",
        serve: "Acórdãos, decisões monocráticas, súmulas e informativos com operadores de busca.",
        como: [
          "Operadores: E, OU, NÃO, ADJ (adjacente, na ordem), PROX (próximo, qualquer ordem), MESMO (mesmo campo). Ex.: dano ADJ moral E negativa$ PROX inscri$.",
          "Use $ para truncar radicais (inscri$ acha inscrição e inscrito) e aspas para expressão exata.",
          "Filtre por órgão julgador: Corte Especial e Seções uniformizam; Turmas podem divergir entre si.",
          "Ordene por data e leia os 3 a 5 acórdãos mais recentes da Seção: é o retrato atual, não o mais citado.",
        ],
        conferido: false,
      },
      {
        nome: "Repetitivos e IACs anotados",
        url: "https://scon.stj.jus.br/SCON/repetitivos/listaRR.jsp",
        serve: "Temas repetitivos e incidentes de assunção de competência com tese, situação e afetação.",
        como: [
          "Situação do tema: afetado (pode haver suspensão, art. 1.037, II, do CPC), julgado, transitado, revisado ou cancelado.",
          "Copie a tese da lista oficial e anote o número do tema. Tema revisado tem tese nova: confira a data.",
          "Tese repetitiva vincula juízes e tribunais (art. 927, III); o descumprimento cabe reclamação após esgotar instâncias (art. 988, § 5º, II).",
        ],
        conferido: true,
      },
      {
        nome: "Súmulas do STJ",
        url: "https://scon.stj.jus.br/SCON/sumstj/",
        serve: "Enunciados com a situação (vigente, cancelado, alterado) e os precedentes de origem.",
        como: [
          "Confirme a situação do enunciado e se houve alteração de redação.",
          "Súmula do STJ orienta (art. 927, IV): o juiz que se afasta precisa demonstrar distinção ou superação (art. 489, § 1º, VI).",
        ],
        conferido: true,
      },
      {
        nome: "Jurisprudência em Teses",
        url: "https://scon.stj.jus.br/SCON/jt/",
        serve: "Teses agrupadas por tema, com os acórdãos que sustentam cada uma e a indicação de repetitivo quando há.",
        como: [
          "Use como mapa por assunto e órgão julgador; abra os acórdãos listados em cada tese.",
          "A edição tem data: tese antiga pode ter sido superada. Confira o acórdão mais recente da Seção.",
        ],
        conferido: true,
      },
      {
        nome: "Informativo de Jurisprudência do STJ",
        url: "https://processo.stj.jus.br/jurisprudencia/externo/InformativoFeed",
        serve: "Julgados relevantes da semana, com destaque, ramo do direito e órgão julgador. Principal sinal de overruling e distinguishing.",
        como: [
          "Procure no texto as marcas de virada: \"superação\", \"revisão de entendimento\", \"distinção\", \"distinguishing\", \"overruling\", \"afetação\".",
          "Toda virada anunciada no informativo deve ser confirmada no acórdão publicado no DJe antes de entrar numa peça.",
          "Se a virada atinge processo seu, cadastre o tema no Monitor de precedentes da Biblioteca.",
        ],
        conferido: true,
      },
    ],
    checagem: [
      "É tema repetitivo julgado ou súmula? Qual o número e a data da última revisão?",
      "A Seção competente ainda decide assim? Leia os acórdãos dos últimos 12 meses.",
      "Há afetação nova que suspende o seu processo?",
      "O seu caso tem fato que justifique distinção? Escreva a distinção de forma explícita (art. 489, § 1º, VI).",
    ],
  },
  {
    id: "normativo",
    numero: 3,
    titulo: "Fontes primárias normativas e atos regulatórios",
    objetivo: "Confirmar existência, vigência e redação atual da norma antes de qualquer tese. Lei citada em versão revogada é o erro mais caro e o mais fácil de evitar.",
    fontes: [
      {
        nome: "Diário Oficial da União (Imprensa Nacional)",
        url: "https://www.in.gov.br/leiturajornal",
        serve: "Publicação oficial de leis, decretos, medidas provisórias, resoluções de agências e conselhos, portarias e sanções.",
        como: [
          "Leia o sumário da Seção 1 (atos normativos) do dia; Seções 2 e 3 só quando o caso pede (pessoal e contratos).",
          "Na busca avançada, filtre por órgão, tipo de ato e período; salve a busca que se repete.",
          "Guarde a referência completa: tipo, número, data, edição, seção e página do DOU.",
          "A Imprensa Nacional recusa leitura automática; por isso o DOU não entra no feed e a checagem diária é manual.",
        ],
        conferido: false,
      },
      {
        nome: "Legislação do Planalto (texto compilado)",
        url: "https://www.planalto.gov.br/ccivil_03/",
        serve: "Constituição, códigos, leis complementares e ordinárias, decretos e MPs com texto compilado e notas de alteração.",
        como: [
          "Abra sempre a versão compilada e leia a nota de redação do dispositivo (\"Redação dada pela Lei nº …\").",
          "Confira vacatio legis e data de vigência do dispositivo, não só da lei.",
          "Verifique se o dispositivo foi declarado inconstitucional ou teve eficácia suspensa (o Planalto anota algumas, não todas: confirme no STF).",
          "Texto do Planalto é de referência; o oficial é o publicado no DOU. Em divergência, prevalece o DOU.",
        ],
        conferido: false,
      },
      {
        nome: "Câmara dos Deputados · Direito e Justiça",
        url: "https://www.camara.leg.br/noticias/rss",
        serve: "Projetos em tramitação que podem alterar o direito aplicável ao caso.",
        como: ["Use para antecipar mudança; só cite como lei depois da sanção e da publicação no DOU."],
        conferido: true,
      },
    ],
    checagem: [
      "O dispositivo está em vigor hoje, nesta redação?",
      "Houve declaração de inconstitucionalidade, suspensão ou interpretação conforme pelo STF?",
      "Há regulamentação (decreto, resolução) que muda a aplicação prática?",
    ],
  },
  {
    id: "monitoramento",
    numero: 4,
    titulo: "Ecossistemas integrados e monitoramento em tempo real",
    objetivo: "Ver o processo e o tribunal como dados (CNJ) e acompanhar teses ainda em debate (sessões e transmissões).",
    fontes: [
      {
        nome: "DataJud (CNJ) · API pública de metadados processuais",
        url: "https://datajud-wiki.cnj.jus.br/",
        serve: "Movimentações e classes processuais padronizadas (TPU) de todos os tribunais. O Clepsa já usa o DataJud nos andamentos dos processos.",
        como: [
          "Use para tramitação e estatística, não para conteúdo da decisão: o DataJud traz movimentos, não o texto.",
          "Movimento \"conclusos\" ou \"julgado\" sinaliza; o conteúdo se confirma no sistema do tribunal.",
        ],
        conferido: false,
      },
      {
        nome: "Painéis do CNJ (estatísticas do Judiciário)",
        url: "https://paineis.cnj.jus.br/",
        serve: "Justiça em Números, tempos de tramitação, taxa de congestionamento e produtividade por tribunal e vara.",
        como: ["Use para estimar duração e risco (jurimetria). Cite o painel, o filtro e a data da extração."],
        conferido: true,
      },
      {
        nome: "Pauta de julgamentos presenciais do STF",
        url: "https://portal.stf.jus.br/pauta/pesquisarCalendario.asp",
        serve: "Calendário do Plenário presencial, para saber quando um tema volta a julgamento.",
        como: ["Ao ver tema de interesse na pauta, programe-se para a transmissão e para o informativo da semana seguinte."],
        conferido: true,
      },
      {
        nome: "TV Justiça e Rádio Justiça",
        url: "https://radioetvjustica.jus.br/",
        serve: "Transmissão oficial das sessões do STF.",
        como: [
          "Sustentação oral e debate mostram a tendência, mas tese só existe depois de proclamado o resultado e publicado o acórdão.",
          "Anote o minuto do vídeo em que a tese foi proclamada: ajuda a conferir a ata.",
        ],
        conferido: true,
      },
      {
        nome: "Canal oficial do STF no YouTube",
        url: "https://www.youtube.com/@STF_oficial",
        serve: "Gravações das sessões plenárias e das Turmas.",
        como: ["Bom para rever o debate de um tema específico depois da sessão."],
        conferido: true,
      },
      {
        nome: "Canal oficial do STJ no YouTube",
        url: "https://www.youtube.com/@STJnoticias",
        serve: "Sessões da Corte Especial, Seções e Turmas, e eventos institucionais.",
        como: ["Acompanhe sessões de afetação e de julgamento de repetitivos de interesse."],
        conferido: true,
      },
    ],
    checagem: [
      "O que vi na transmissão já está em ata ou acórdão publicado?",
      "O dado estatístico tem fonte, filtro e data anotados?",
    ],
  },
];

/** Hierarquia de confiabilidade: de cima para baixo. */
export const HIERARQUIA = [
  { nivel: 1, titulo: "Vinculante", texto: "Súmula vinculante, decisão em controle concentrado, tese de repercussão geral e de repetitivo, IAC e IRDR (art. 927, I a III, do CPC). Citar com número, data e link oficial." },
  { nivel: 2, titulo: "Obrigatório de observar", texto: "Súmulas do STF e do STJ e orientação do plenário ou órgão especial (art. 927, IV e V). Afastar exige distinção ou superação fundamentada." },
  { nivel: 3, titulo: "Persuasivo", texto: "Acórdãos de Turma, decisões monocráticas, Jurisprudência em Teses. Mostram a tendência; nunca sozinhos." },
  { nivel: 4, titulo: "Sinal", texto: "Informativos, notícias oficiais, pauta e transmissões. Servem para descobrir e priorizar; o que se cita é o acórdão." },
  { nivel: 5, titulo: "Fora do protocolo", texto: "Agregadores, blogs, redes sociais, doutrina não homologada. Podem ajudar a achar; não entram como fundamento." },
];

/** Rotina de monitoramento contínuo. */
export const ROTINA = [
  {
    quando: "Todo dia (manhã)",
    itens: [
      "Abrir a aba News: o Clepsa já leu os feeds oficiais na madrugada.",
      "Ler o sumário da Seção 1 do DOU.",
      "Marcar o que afeta processo em andamento e cadastrar o tema no Monitor de precedentes.",
    ],
  },
  {
    quando: "Toda semana",
    itens: [
      "Ler o Informativo STF e o Informativo do STJ da semana, procurando superação e distinção.",
      "Conferir a pauta do Plenário presencial do STF para a semana seguinte.",
      "Rever a situação dos temas de repercussão geral e repetitivos que suspendem processos seus.",
    ],
  },
  {
    quando: "Todo mês",
    itens: [
      "Conferir a lista de súmulas vinculantes e de súmulas do STJ (revisões e cancelamentos).",
      "Ler a nova edição de Jurisprudência em Teses quando sair.",
      "Atualizar os itens da Biblioteca que citam teses revistas.",
    ],
  },
  {
    quando: "Antes de protocolar",
    itens: [
      "Cada lei citada: conferir a redação compilada e a vigência no Planalto.",
      "Cada precedente: conferir número, situação (vigente, revisado, cancelado) e link oficial.",
      "Usar a verificação de citações do Clepsa e abrir o link de cada fonte.",
    ],
  },
];

export const ALERTAS_FORMAIS = [
  { nome: "Feeds RSS e Atom do STJ (índice oficial)", url: "https://www.stj.jus.br/sites/portalp/Paginas/RSS.aspx" },
  { nome: "Feeds da Câmara dos Deputados (por tema)", url: "https://www.camara.leg.br/noticias/rss" },
  { nome: "Feed de notícias do Senado", url: "https://www12.senado.leg.br/noticias/rss" },
];
