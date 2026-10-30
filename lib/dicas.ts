/**
 * Dicas de tela: um balão que explica cada funcionalidade na primeira vez que a pessoa a abre.
 * Podem ser desligadas em Minha conta > Preferências. Sem React, para poderem ser testadas.
 */

export interface Dica {
  id: string;
  titulo: string;
  texto: string;
  /** Telas em que a dica aparece. */
  rota: string | RegExp;
  /** Elementos destacados, na ordem de preferência; vale o primeiro visível. Sem nenhum, o balão fica no centro. */
  alvos: string[];
}

const TITULO = '[data-tour="titulo"]';

export const DICAS: Dica[] = [
  {
    id: "painel",
    titulo: "Boas-vindas ao Clepsa",
    texto: "Este é o Painel, com o resumo das intimações da sua carteira. Na primeira vez que você abrir cada tela, aparece uma dica como esta. Para desligá-las, vá em Minha conta, na aba Preferências.",
    rota: "/",
    alvos: [TITULO],
  },
  {
    id: "hoje",
    titulo: "Hoje: o que vence agora",
    texto: "A primeira tela do dia. Reúne os prazos vencidos, os que vencem hoje e os dos próximos dias, do mais urgente para o menos urgente.",
    rota: "/hoje",
    alvos: [TITULO],
  },
  {
    id: "intimacoes",
    titulo: "Intimações",
    texto: "Tudo o que foi publicado para os seus clientes. Filtre, defina o responsável e confira o prazo. Cada uma ganha uma tarefa sugerida (contestar, recorrer, comparecer à audiência) e, com a IA ligada, um resumo do teor.",
    rota: "/intimacoes",
    alvos: [TITULO],
  },
  {
    id: "comunica",
    titulo: "Busca no Comunica PJe",
    texto: "Busque no Diário de Justiça Eletrônico pelo nome ou OAB e importe o que encontrar. Na aba Clientes monitorados, o Clepsa passa a buscar sozinho, várias vezes ao dia.",
    rota: "/comunica",
    alvos: [TITULO],
  },
  {
    id: "clientes",
    titulo: "Clientes monitorados",
    texto: "Cada nome ou OAB cadastrado aqui é consultado automaticamente no Comunica PJe. As publicações novas entram em Intimações e aparecem no sino.",
    rota: "/clientes",
    alvos: [TITULO],
  },
  {
    id: "processos",
    titulo: "Processos em quadro",
    texto: "Cada caso é um cartão. Arraste de uma fase para a outra, do atendimento ao protocolo, e acompanhe a prescrição de cada um.",
    rota: "/processos",
    alvos: [TITULO],
  },
  {
    id: "central",
    titulo: "Central de casos",
    texto: "A visão em lista de todos os casos, com filtros salvos, avanço em lote e histórico de cada etapa. Tecle Ctrl+K para abrir a paleta de comandos.",
    rota: "/processos/central",
    alvos: [TITULO],
  },
  {
    id: "revisao",
    titulo: "Revisão em tabela",
    texto: "Faça as mesmas perguntas a vários processos de uma vez. A IA lê os PDFs e preenche a tabela, sempre mostrando a página de onde tirou cada resposta.",
    rota: "/processos/revisao",
    alvos: [TITULO],
  },
  {
    id: "processo",
    titulo: "A ficha do processo",
    texto: "Nas abas com IA, ela lê os documentos enviados, responde perguntas no Assistente, avalia o Risco e escreve o rascunho do Parecer. A IA prepara, e a revisão final é sempre sua.",
    rota: /^\/processos\/(?!novo$|central$|revisao$|protocolados$)[^/]+$/,
    alvos: ['[data-tour="abas-processo"]'],
  },
  {
    id: "pedidos",
    titulo: "Pedidos",
    texto: "Quem quer falar com o escritório: o formulário de atendimento, as mensagens do portal do cliente e os contatos anotados à mão. A IA sugere a urgência e a área de cada pedido.",
    rota: "/pedidos",
    alvos: [TITULO],
  },
  {
    id: "biblioteca",
    titulo: "Biblioteca",
    texto: "Seus modelos de peça, jurisprudência e súmulas num só lugar, com atalhos de pesquisa nos tribunais. Na aba Parecer de um processo, o botão Rascunho pela IA usa estes itens para começar o texto.",
    rota: "/biblioteca",
    alvos: [TITULO],
  },
  {
    id: "fluxos",
    titulo: "Fluxos de IA",
    texto: "Monte uma sequência de passos para a IA seguir, como ler os documentos, extrair os pontos e redigir um resumo, e rode em um ou vários processos com um clique.",
    rota: "/fluxos",
    alvos: [TITULO],
  },
  {
    id: "prazos",
    titulo: "Prazos e avisos",
    texto: "O vencimento é contado em dias úteis, com feriados e recesso. Aqui você cadastra suspensões e escolhe como receber os avisos: e-mail ou Google Agenda.",
    rota: "/prazos",
    alvos: [TITULO],
  },
  {
    id: "equipe",
    titulo: "Equipe",
    texto: "Convide advogados e estagiários, defina o papel de cada um e veja a carga de trabalho. As intimações podem ser entregues a um responsável pela lista ou pela ficha.",
    rota: "/equipe",
    alvos: [TITULO],
  },
  {
    id: "relatorios",
    titulo: "Clientes e portal",
    texto: "Monte a prestação de contas do período para mandar ao cliente, ou abra o Portal do cliente para ele acompanhar sozinho.",
    rota: "/relatorios",
    alvos: [TITULO],
  },
  {
    id: "dados",
    titulo: "Dados e backup",
    texto: "Seus dados ficam no servidor, isolados no seu escritório. Aqui você exporta as intimações (Excel, CSV ou PDF) e baixa ou restaura uma cópia de segurança completa.",
    rota: "/dados",
    alvos: [TITULO],
  },
];

export function dicaDaRota(pathname: string): Dica | undefined {
  return DICAS.find((d) => (typeof d.rota === "string" ? d.rota === pathname : d.rota.test(pathname)));
}

export interface EstadoDicas {
  ligadas: boolean;
  vistas: string[];
}

export const ESTADO_INICIAL: EstadoDicas = { ligadas: true, vistas: [] };

export const chaveDicas = (usuarioId: string) => `clepsa:dicas:${usuarioId}`;

/** Lê o que foi guardado, tolerando valor ausente ou corrompido. */
export function lerEstado(bruto: string | null): EstadoDicas {
  try {
    const v = JSON.parse(bruto ?? "null") as Partial<EstadoDicas> | null;
    if (!v || typeof v !== "object") return ESTADO_INICIAL;
    return { ligadas: v.ligadas !== false, vistas: Array.isArray(v.vistas) ? v.vistas.filter((x): x is string => typeof x === "string") : [] };
  } catch {
    return ESTADO_INICIAL;
  }
}

/** A dica a mostrar ao abrir esta tela, se houver. */
export function dicaParaMostrar(pathname: string, estado: EstadoDicas): Dica | undefined {
  if (!estado.ligadas) return undefined;
  const d = dicaDaRota(pathname);
  return d && !estado.vistas.includes(d.id) ? d : undefined;
}

export interface Retangulo {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Posicao {
  top: number;
  left: number;
  /** Lado do alvo em que o balão ficou; "centro" quando não há alvo. */
  lado: "abaixo" | "acima" | "direita" | "centro";
}

const MARGEM = 16;
const AFASTAMENTO = 12;

/**
 * Onde pôr o balão: à direita de alvos estreitos da esquerda, senão abaixo, senão acima;
 * sempre dentro da tela. Sem alvo, no centro.
 */
export function posicionarBalao(alvo: Retangulo | null, tela: { largura: number; altura: number }, balao: { largura: number; altura: number }): Posicao {
  const prender = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)));
  if (!alvo) {
    return { lado: "centro", top: prender((tela.altura - balao.altura) / 2, MARGEM, tela.altura - balao.altura - MARGEM), left: prender((tela.largura - balao.largura) / 2, MARGEM, tela.largura - balao.largura - MARGEM) };
  }
  const maxLeft = tela.largura - balao.largura - MARGEM;
  const maxTop = tela.altura - balao.altura - MARGEM;

  const direita = alvo.left + alvo.width + AFASTAMENTO;
  if (alvo.left < tela.largura / 3 && direita + balao.largura + MARGEM <= tela.largura && alvo.width < tela.largura / 3) {
    return { lado: "direita", left: direita, top: prender(alvo.top + alvo.height / 2 - balao.altura / 2, MARGEM, maxTop) };
  }
  const abaixo = alvo.top + alvo.height + AFASTAMENTO;
  if (abaixo + balao.altura + MARGEM <= tela.altura) {
    return { lado: "abaixo", top: abaixo, left: prender(alvo.left, MARGEM, maxLeft) };
  }
  const acima = alvo.top - AFASTAMENTO - balao.altura;
  if (acima >= MARGEM) {
    return { lado: "acima", top: acima, left: prender(alvo.left, MARGEM, maxLeft) };
  }
  // Alvo grande demais para caber o balão ao lado: ele fica por cima, no rodapé.
  return { lado: "abaixo", top: maxTop, left: prender(alvo.left, MARGEM, maxLeft) };
}
