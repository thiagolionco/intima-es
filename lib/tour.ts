/**
 * Tour guiado: a sequência de balões que apresenta o Clepsa a quem acabou de entrar.
 * Os passos e o cálculo de posição ficam aqui, sem React, para poderem ser testados.
 */

export interface PassoTour {
  id: string;
  titulo: string;
  texto: string;
  /** Página aberta antes de mostrar o balão; sem rota, o balão aparece onde a pessoa está. */
  rota?: string;
  /**
   * Elementos destacados, na ordem de preferência; vale o primeiro visível
   * (a barra lateral some no celular, e o botão do menu toma o lugar dela).
   * Sem alvo, ou sem nenhum visível, o balão aparece no centro da tela.
   */
  alvos?: string[];
}

/** Muda a versão quando o tour mudar muito, para todos verem a nova apresentação uma vez. */
export const VERSAO_TOUR = 1;

export const chaveTourVisto = (usuarioId: string) => `clepsa:tour:v${VERSAO_TOUR}:${usuarioId}`;

const TITULO = '[data-tour="titulo"]';

export const PASSOS_TOUR: PassoTour[] = [
  {
    id: "boas-vindas",
    titulo: "Boas-vindas ao Clepsa",
    texto: "Em dois minutos, mostramos onde fica cada coisa: intimações, prazos, processos e as ferramentas de IA. Use as setas do teclado ou os botões abaixo, e pule quando quiser.",
  },
  {
    id: "menu",
    titulo: "O menu principal",
    texto: "Todas as áreas do sistema ficam aqui. Os números ao lado de Hoje, Intimações e Pedidos mostram o que está esperando por você.",
    alvos: ['[data-tour="menu"]', '[data-tour="menu-celular"]'],
  },
  {
    id: "hoje",
    titulo: "Hoje: o que vence agora",
    texto: "A primeira tela do dia. Reúne os prazos vencidos, os que vencem hoje e os dos próximos dias, para nada passar despercebido.",
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
    texto: "Cadastre os clientes monitorados (nome ou OAB) e o Clepsa consulta o Diário de Justiça Eletrônico sozinho, várias vezes ao dia. Você também pode buscar na hora.",
    rota: "/comunica",
    alvos: [TITULO],
  },
  {
    id: "processos",
    titulo: "Processos em quadro",
    texto: "Cada caso é um cartão. Arraste de uma fase para a outra, do atendimento ao protocolo, e acompanhe a prescrição. Dentro do processo, a IA lê os PDFs, escreve o parecer e avalia o risco.",
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
    id: "prazos",
    titulo: "Prazos e avisos",
    texto: "O vencimento é contado em dias úteis, com feriados e recesso. Aqui você cadastra suspensões e escolhe como receber os avisos: e-mail ou Google Agenda.",
    rota: "/prazos",
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
    texto: "Monte uma sequência de passos para a IA seguir, como ler um documento, extrair os pontos e redigir um parecer, e rode sempre que precisar. A IA prepara, e a revisão final é sempre sua.",
    rota: "/fluxos",
    alvos: [TITULO],
  },
  {
    id: "sino",
    titulo: "Notificações",
    texto: "O sino junta prazos urgentes, intimações novas e qualquer falha na busca automática. Se a vigília parar, você fica sabendo aqui e por e-mail.",
    alvos: ['[data-tour="sino"]', '[data-tour="sino-celular"]'],
  },
  {
    id: "ajuda",
    titulo: "Pronto!",
    texto: "Quando quiser rever este tour, é só abrir a Ajuda aqui. Bom trabalho!",
    alvos: ['[data-tour="ajuda"]', '[data-tour="ajuda-celular"]'],
  },
];

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
 * Onde pôr o balão: à direita de alvos estreitos da barra lateral, senão abaixo, senão acima;
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
  // Alvo grande demais (o menu inteiro numa tela baixa): o balão fica por cima, no rodapé.
  return { lado: "abaixo", top: maxTop, left: prender(alvo.left, MARGEM, maxLeft) };
}
