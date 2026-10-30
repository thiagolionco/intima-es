import { CONTATO, DESCRICAO, TITULO_PRINCIPAL, URL_DO_SITE } from "./site.ts";

/**
 * Texto das páginas públicas (início, sobre, contato, privacidade e documentação).
 * Uma única fonte para o HTML e para a versão em Markdown servida a agentes (Accept: text/markdown).
 * Links no formato Markdown, [texto](/caminho), viram <a> no HTML.
 */

export interface Secao {
  titulo: string;
  paragrafos?: string[];
  itens?: string[];
  codigo?: string;
}

export interface PaginaPublica {
  caminho: string;
  /** Título curto da aba (o layout acrescenta " · Clepsa"). */
  titulo: string;
  descricao: string;
  h1: string;
  introducao: string[];
  secoes: Secao[];
}

const PAGINA_INICIAL: PaginaPublica = {
  caminho: "/",
  titulo: TITULO_PRINCIPAL,
  descricao: DESCRICAO,
  h1: TITULO_PRINCIPAL,
  introducao: [
    "O Clepsa acompanha as publicações do Comunica PJe, o Diário de Justiça Eletrônico Nacional (DJEN) do CNJ, em nome dos clientes e advogados que o escritório monitora.",
    "Cada intimação encontrada entra numa lista única, com prazo, responsável e situação. A equipe recebe avisos por e-mail e vê, numa só tela, o que vence hoje e amanhã.",
  ],
  secoes: [
    {
      titulo: "O que o Clepsa faz",
      itens: [
        "Busca automática no Comunica PJe a cada 6 horas pelos nomes e números de OAB cadastrados, com registro de quais dias foram verificados.",
        "Prazo de cada intimação, com responsável, situação (nova, em análise, respondida, arquivada) e aviso por e-mail.",
        "Tela Hoje com os prazos vencidos, os que vencem hoje e amanhã e as intimações novas.",
        "Processos com andamentos do DataJud (CNJ), documentos em PDF, pareceres e um quadro por fase.",
        "Ferramentas de inteligência artificial que resumem e sugerem, sempre com a fonte e com revisão de uma pessoa antes de qualquer uso.",
        "Equipe do escritório com papéis (dono, advogado, estagiário), processos particulares, relatórios para clientes e envio de prazos ao Google Agenda.",
      ],
    },
    {
      titulo: "Para quem é",
      paragrafos: [
        "Escritórios de advocacia e advogados autônomos que recebem intimações pelo DJEN e precisam controlar prazos em equipe, sem depender de conferir o diário todos os dias.",
      ],
    },
    {
      titulo: "Como começar",
      itens: ["[Crie uma conta](/criar-conta) ou [entre](/entrar).", "Cadastre os clientes e os números de OAB que quer monitorar.", "Acompanhe as intimações e os prazos no painel e na tela Hoje."],
    },
    {
      titulo: "Dados e privacidade",
      paragrafos: [
        "As intimações e os processos de cada escritório ficam num banco de dados em São Paulo, separados por escritório no próprio banco. Só quem tem conta no escritório vê esses dados. Veja a [política de privacidade](/privacidade).",
      ],
    },
    {
      titulo: "Para agentes de IA e desenvolvedores",
      paragrafos: [
        "O Clepsa não oferece uma API pública de dados: intimações, processos e clientes só aparecem para usuários com login. As páginas públicas estão descritas em [llms.txt](/llms.txt), na [documentação](/docs) e na [especificação OpenAPI](/openapi.json).",
      ],
    },
  ],
};

const SOBRE: PaginaPublica = {
  caminho: "/sobre",
  titulo: "Sobre o Clepsa",
  descricao: "O que é o Clepsa, para quem foi feito e como funciona o monitoramento de intimações do Comunica PJe.",
  h1: "Sobre o Clepsa",
  introducao: [
    "O Clepsa é um aplicativo web para escritórios de advocacia acompanharem intimações e prazos. O nome vem de clepsidra, o relógio de água usado nos tribunais da Grécia antiga para marcar o tempo de fala de cada parte.",
  ],
  secoes: [
    {
      titulo: "O problema",
      paragrafos: [
        "As intimações são publicadas todos os dias no Diário de Justiça Eletrônico Nacional e consultadas pelo Comunica PJe. Conferir manualmente cada cliente, todos os dias, toma tempo e deixa espaço para um prazo passar sem ninguém ver.",
      ],
    },
    {
      titulo: "Como o Clepsa resolve",
      paragrafos: [
        "O escritório cadastra os nomes e os números de OAB que quer monitorar. O Clepsa consulta o Comunica PJe automaticamente, guarda cada intimação nova, registra quais dias já foram verificados e avisa quando uma verificação falha, para que a falta de resultado nunca seja confundida com ausência de intimação.",
        "A partir daí a equipe distribui responsáveis, acompanha prazos, organiza os processos por fase e prepara relatórios para os clientes.",
      ],
    },
    {
      titulo: "Fontes de dados",
      itens: [
        "Comunica PJe (Diário de Justiça Eletrônico Nacional), mantido pelo Conselho Nacional de Justiça.",
        "DataJud, a base pública de metadados processuais do CNJ, para os andamentos dos processos.",
        "Documentos e informações que o próprio escritório cadastra.",
      ],
    },
  ],
};

const CONTATO_PAGINA: PaginaPublica = {
  caminho: "/contato",
  titulo: "Contato",
  descricao: "Como falar com a equipe do Clepsa e onde resolver dúvidas sobre conta, acesso e dados.",
  h1: "Contato",
  introducao: [
    CONTATO.email
      ? `Para falar com a equipe do Clepsa, escreva para ${CONTATO.email}${CONTATO.telefone ? ` ou ligue para ${CONTATO.telefone}` : ""}.`
      : "O canal público de atendimento do Clepsa (e-mail e telefone) ainda está sendo definido e será publicado nesta página. Enquanto isso, os caminhos abaixo resolvem a maior parte dos pedidos.",
  ],
  secoes: [
    {
      titulo: "Já tem conta",
      itens: [
        "Esqueceu a senha: use [Esqueci a senha](/esqueci-a-senha). O link chega no e-mail cadastrado.",
        "Dúvidas sobre acesso, papéis ou convites da equipe: fale com o dono do seu escritório no Clepsa, que gerencia quem entra e o que cada pessoa pode fazer.",
        "Cópia dos seus dados: exporte em Dados, dentro do aplicativo.",
        "Excluir a conta: em Conta, dentro do aplicativo, com confirmação de senha.",
      ],
    },
    {
      titulo: "É cliente de um escritório",
      paragrafos: [
        "Se você é cliente de um escritório que usa o Clepsa, fale diretamente com o seu advogado. O escritório é quem cadastra e trata os seus dados, e é ele quem responde pelos seus processos.",
      ],
    },
    {
      titulo: "Ainda não usa o Clepsa",
      paragrafos: ["Você pode [criar uma conta](/criar-conta) e cadastrar os primeiros clientes em poucos minutos. Para entender como os dados são tratados, leia a [política de privacidade](/privacidade)."],
    },
  ],
};

const PRIVACIDADE: PaginaPublica = {
  caminho: "/privacidade",
  titulo: "Política de privacidade",
  descricao: "Quais dados o Clepsa guarda, para que usa, onde ficam, com quem compartilha e como pedir cópia ou exclusão, conforme a LGPD.",
  h1: "Política de privacidade",
  introducao: [
    "Esta página explica, em linguagem simples, como o Clepsa trata dados pessoais, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018).",
  ],
  secoes: [
    {
      titulo: "Quais dados guardamos",
      itens: [
        "Dados da conta: nome, e-mail, escritório, número de OAB (opcional) e senha, que é guardada só como resumo criptográfico (scrypt), nunca em texto.",
        "Registros de segurança: data, endereço IP e navegador de cada login e das sessões abertas.",
        "Dados de trabalho que o escritório cadastra ou importa: clientes monitorados, intimações do Comunica PJe, prazos, processos, documentos e anotações.",
      ],
    },
    {
      titulo: "Para que usamos",
      paragrafos: [
        "Para prestar o serviço: buscar e organizar intimações, calcular prazos, mandar avisos por e-mail e manter a conta segura. Não vendemos dados e não usamos os dados dos escritórios para publicidade.",
      ],
    },
    {
      titulo: "Papéis na LGPD",
      paragrafos: [
        "Sobre os dados dos clientes cadastrados, o escritório é o controlador e o Clepsa atua como operador, tratando esses dados só para o escritório. Sobre os dados da conta de cada usuário, o Clepsa é o controlador.",
      ],
    },
    {
      titulo: "Onde os dados ficam e quem vê",
      paragrafos: [
        "O banco de dados fica em São Paulo e a aplicação também roda no Brasil. A conexão é sempre criptografada. Cada escritório só vê os próprios registros, separação aplicada pelo próprio banco de dados, e processos marcados como particulares só aparecem para quem os cadastrou.",
      ],
    },
    {
      titulo: "Com quem compartilhamos",
      itens: [
        "Provedores de infraestrutura que hospedam a aplicação e o banco de dados.",
        "O provedor de e-mail usado para mandar avisos e mensagens da conta.",
        "A Anthropic, quando alguém do escritório usa uma ferramenta de inteligência artificial: o texto vai só no momento da tarefa pedida e, pelos termos comerciais da API, não é usado para treinar modelos.",
        "O Google, só se o usuário conectar a própria agenda para receber os prazos.",
      ],
    },
    {
      titulo: "Cookies",
      paragrafos: [
        "Usamos um único cookie essencial, que mantém a sessão aberta depois do login. Não usamos cookies de publicidade nem de rastreamento.",
      ],
    },
    {
      titulo: "Seus direitos",
      paragrafos: [
        "Você pode ver e corrigir os dados da conta em Conta, baixar uma cópia de tudo em Dados e excluir a conta definitivamente, com todos os dados, também em Conta. Clientes de um escritório devem fazer os pedidos ao próprio escritório, que é o controlador desses dados. Outros pedidos: veja a página de [contato](/contato).",
      ],
    },
  ],
};

const DOCS: PaginaPublica = {
  caminho: "/docs",
  titulo: "Documentação para desenvolvedores e agentes",
  descricao: "O que o Clepsa publica para agentes de IA e desenvolvedores: páginas em Markdown, llms.txt, sitemap e especificação OpenAPI. Não há API pública de dados.",
  h1: "Documentação do Clepsa para desenvolvedores e agentes de IA",
  introducao: [
    "O Clepsa é um aplicativo com login. Intimações, processos, clientes e prazos são dados sigilosos de escritórios de advocacia e não ficam disponíveis fora da conta de cada escritório. Por isso não existe uma API pública de dados, nem chaves de API para terceiros, nem servidor MCP.",
    "O que é público está listado abaixo. Tudo pode ser lido sem autenticação, só com GET.",
  ],
  secoes: [
    {
      titulo: "Recursos públicos",
      itens: [
        "[/llms.txt](/llms.txt): resumo do Clepsa para modelos de linguagem, com quando usar e links.",
        "[/openapi.json](/openapi.json): especificação OpenAPI 3.1 das rotas públicas listadas aqui.",
        "[/sitemap.xml](/sitemap.xml) e [/robots.txt](/robots.txt): páginas indexáveis e regras para robôs.",
        "Páginas [início](/), [sobre](/sobre), [contato](/contato), [privacidade](/privacidade) e esta documentação, em HTML ou em Markdown.",
      ],
    },
    {
      titulo: "Markdown por negociação de conteúdo",
      paragrafos: [
        "Envie o cabeçalho Accept: text/markdown para receber qualquer página pública em Markdown, com Content-Type: text/markdown e Vary: Accept. Sem esse cabeçalho, a resposta é HTML.",
      ],
      codigo: `curl -H 'Accept: text/markdown' ${URL_DO_SITE}/\ncurl -H 'Accept: text/markdown' ${URL_DO_SITE}/privacidade`,
    },
    {
      titulo: "Erros",
      paragrafos: [
        "Endereços que não existem respondem com HTTP 404. Com Accept: text/markdown, o corpo do erro vem em Markdown e aponta para esta documentação, para o sitemap e para o llms.txt.",
      ],
    },
    {
      titulo: "Autenticação",
      paragrafos: [
        "As rotas internas do aplicativo usam a sessão de login do navegador e servem só à interface do próprio Clepsa. Elas não são uma API estável, não aceitam chaves de terceiros e não estão descritas na especificação OpenAPI.",
      ],
    },
    {
      titulo: "Limites de uso",
      paragrafos: [
        "Os recursos públicos são arquivos estáticos ou quase estáticos e não têm cota por cliente. Respeite o robots.txt e evite mais de uma requisição por segundo.",
      ],
    },
  ],
};

export const PAGINAS_PUBLICAS: readonly PaginaPublica[] = [PAGINA_INICIAL, SOBRE, CONTATO_PAGINA, PRIVACIDADE, DOCS];

export function paginaPublica(caminho: string): PaginaPublica | undefined {
  return PAGINAS_PUBLICAS.find((p) => p.caminho === caminho);
}

export function paginaPublicaObrigatoria(caminho: string): PaginaPublica {
  const pagina = paginaPublica(caminho);
  if (!pagina) throw new Error(`Página pública desconhecida: ${caminho}`);
  return pagina;
}
