/**
 * Casos de avaliação (evals) do Agente de Prazos.
 *
 * Cada caso é uma publicação com a resposta certa ("gabarito"), escrita por quem conhece o
 * processo. O script `npm run avaliar:prazos` roda o agente em todos e conta os acertos.
 * Regra de ouro: quando o agente errar um caso real no dia a dia, o caso vem para cá, com o
 * gabarito certo. Assim o erro nunca volta sem ninguém perceber.
 *
 * Os vencimentos foram calculados com o calendário do Clepsa (feriados nacionais, Lei 5.010 na
 * Justiça Federal, recesso de 20/12 a 20/01) e conferidos à mão nos casos marcados "conferido à mão".
 */
import type { TipoTarefa } from "../../lib/tarefas.ts";
import type { ContagemPrazo, Suspensao } from "../../lib/types.ts";
import type { DadosAgentePrazos } from "../../lib/prazos/agente-prazos.ts";

export interface CasoAvaliacao {
  id: string;
  /** O que o caso testa, em uma frase. */
  testa: string;
  intimacao: DadosAgentePrazos;
  suspensoes?: Suspensao[];
  esperado: {
    tarefa: TipoTarefa;
    /** Prazo simples, sem o dobro. 0 = não abre prazo. */
    dias: number;
    contagem: ContagemPrazo;
    dobro: boolean;
    /** AAAA-MM-DD, ou null quando não há prazo. */
    vencimento: string | null;
    dataAudiencia?: string;
  };
}

const civel = { tribunal: "TJPR", classe: "Procedimento Comum Cível", orgao: "3ª Vara Cível de Curitiba", tipoDocumento: "Despacho", tipoComunicacao: "Intimação" };
const trabalho = { tribunal: "TRT9", classe: "Ação Trabalhista - Rito Ordinário", orgao: "2ª Vara do Trabalho de Curitiba", tipoDocumento: "Despacho", tipoComunicacao: "Intimação" };
const penal = { tribunal: "TJPR", classe: "Ação Penal - Procedimento Ordinário", orgao: "1ª Vara Criminal de Londrina", tipoDocumento: "Despacho", tipoComunicacao: "Intimação" };
const juizado = { tribunal: "TJPR", classe: "Procedimento do Juizado Especial Cível", orgao: "1º Juizado Especial Cível de Maringá", tipoDocumento: "Sentença", tipoComunicacao: "Intimação" };

export const CASOS: CasoAvaliacao[] = [
  {
    id: "01-replica-fixada",
    testa: "Prazo escrito no texto, com o feriado de 20/11 no meio (conferido à mão).",
    intimacao: { ...civel, dataDisponibilizacao: "2026-11-03", texto: "Vistos. Manifeste-se a parte autora sobre a contestação e documentos, no prazo de 15 (quinze) dias. Intime-se." },
    esperado: { tarefa: "replica", dias: 15, contagem: "uteis", dobro: false, vencimento: "2026-11-26" },
  },
  {
    id: "02-contestar-prazo-legal",
    testa: "\"Prazo legal\" sem número: o agente precisa saber que contestação é 15 dias.",
    intimacao: { ...civel, tipoComunicacao: "Citação", dataDisponibilizacao: "2026-11-05", texto: "Cite-se a parte ré para, querendo, apresentar contestação no prazo legal, sob pena de revelia." },
    esperado: { tarefa: "contestar", dias: 15, contagem: "uteis", dobro: false, vencimento: "2026-11-30" },
  },
  {
    id: "03-sentenca-civel",
    testa: "Sentença cível sem prazo escrito: apelação em 15 dias úteis.",
    intimacao: { ...civel, tipoDocumento: "Sentença", dataDisponibilizacao: "2026-11-06", texto: "Ante o exposto, JULGO PROCEDENTE o pedido para condenar a ré ao pagamento de R$ 12.000,00 a título de danos morais. Custas pela ré. P.R.I." },
    esperado: { tarefa: "avaliar_recurso", dias: 15, contagem: "uteis", dobro: false, vencimento: "2026-12-01" },
  },
  {
    id: "04-sentenca-trabalhista",
    testa: "Justiça do Trabalho: recurso ordinário em 8 dias úteis, não 15.",
    intimacao: { ...trabalho, tipoDocumento: "Sentença", dataDisponibilizacao: "2026-11-09", texto: "Diante do exposto, julgo PROCEDENTES EM PARTE os pedidos formulados pelo reclamante para condenar a reclamada ao pagamento de horas extras e reflexos. Custas pela reclamada. Intimem-se as partes." },
    esperado: { tarefa: "avaliar_recurso", dias: 8, contagem: "uteis", dobro: false, vencimento: "2026-11-23" },
  },
  {
    id: "05-trabalho-calculos",
    testa: "Trabalho, prazo escrito de 8 dias para falar dos cálculos.",
    intimacao: { ...trabalho, dataDisponibilizacao: "2026-11-10", texto: "Vista à reclamada sobre os cálculos de liquidação apresentados pelo perito contábil, pelo prazo de 8 dias." },
    esperado: { tarefa: "manifestar", dias: 8, contagem: "uteis", dobro: false, vencimento: "2026-11-24" },
  },
  {
    id: "06-penal-resposta-acusacao",
    testa: "Penal conta em dias corridos (CPP, art. 798).",
    intimacao: { ...penal, tipoComunicacao: "Citação", dataDisponibilizacao: "2026-11-04", texto: "Recebo a denúncia. Cite-se o acusado para responder à acusação, por escrito, no prazo de 10 (dez) dias, nos termos do art. 396 do CPP." },
    esperado: { tarefa: "contestar", dias: 10, contagem: "corridos", dobro: false, vencimento: "2026-11-16" },
  },
  {
    id: "07-penal-sentenca",
    testa: "Penal, apelação em 5 dias corridos; o último dia cai no feriado de 20/11 e vai para 23/11 (conferido à mão).",
    intimacao: { ...penal, tipoDocumento: "Sentença", dataDisponibilizacao: "2026-11-12", texto: "Ante o exposto, JULGO PROCEDENTE a denúncia para condenar o réu à pena de 2 anos de reclusão, em regime aberto. Intime-se a defesa." },
    esperado: { tarefa: "avaliar_recurso", dias: 5, contagem: "corridos", dobro: false, vencimento: "2026-11-23" },
  },
  {
    id: "08-audiencia",
    testa: "Audiência não abre prazo: o agente deve ler a data e a hora.",
    intimacao: { ...civel, dataDisponibilizacao: "2026-11-05", texto: "Designo audiência de conciliação para o dia 01/12/2026, às 14h30, a realizar-se por videoconferência. Intimem-se as partes." },
    esperado: { tarefa: "audiencia", dias: 0, contagem: "uteis", dobro: false, vencimento: null, dataAudiencia: "2026-12-01" },
  },
  {
    id: "09-arquivamento",
    testa: "Só ciência: nenhum prazo deve ser criado.",
    intimacao: { ...civel, dataDisponibilizacao: "2026-11-05", texto: "Certificado o trânsito em julgado, arquivem-se os autos com as cautelas de praxe." },
    esperado: { tarefa: "ciencia", dias: 0, contagem: "uteis", dobro: false, vencimento: null },
  },
  {
    id: "10-tutela-deferida",
    testa: "Tutela indeferida: agravo de instrumento em 15 dias úteis, apesar do \"aguarde-se\".",
    intimacao: { ...civel, tipoDocumento: "Decisão", dataDisponibilizacao: "2026-11-11", texto: "Ausente a probabilidade do direito (art. 300 do CPC), indefiro o pedido de tutela de urgência. Aguarde-se a contestação." },
    esperado: { tarefa: "avaliar_recurso", dias: 15, contagem: "uteis", dobro: false, vencimento: "2026-12-04" },
  },
  {
    id: "11-pagamento-523",
    testa: "Cumprimento de sentença: pagar em 15 dias úteis.",
    intimacao: { ...civel, classe: "Cumprimento de Sentença", dataDisponibilizacao: "2026-11-13", texto: "Intime-se o executado para pagar o débito, no prazo de 15 dias, sob pena de multa de 10% e honorários de 10% (art. 523 do CPC)." },
    esperado: { tarefa: "pagar", dias: 15, contagem: "uteis", dobro: false, vencimento: "2026-12-08" },
  },
  {
    id: "12-emenda",
    testa: "Emenda da inicial, prazo escrito.",
    intimacao: { ...civel, dataDisponibilizacao: "2026-11-16", texto: "Emende a parte autora a petição inicial, no prazo de 15 (quinze) dias, para juntar comprovante de residência atualizado, sob pena de indeferimento." },
    esperado: { tarefa: "emendar", dias: 15, contagem: "uteis", dobro: false, vencimento: "2026-12-09" },
  },
  {
    id: "13-pericia-quesitos",
    testa: "Perícia: quesitos e assistente técnico.",
    intimacao: { ...civel, dataDisponibilizacao: "2026-11-17", texto: "Defiro a prova pericial. Nomeio perito o engenheiro João da Silva. Intimem-se as partes para apresentar quesitos e indicar assistentes técnicos no prazo de 15 dias." },
    esperado: { tarefa: "pericia", dias: 15, contagem: "uteis", dobro: false, vencimento: "2026-12-10" },
  },
  {
    id: "14-custas",
    testa: "Prazo curto escrito (5 dias) para custas.",
    intimacao: { ...civel, dataDisponibilizacao: "2026-11-18", texto: "Recolha a parte autora as custas iniciais, no prazo de 5 (cinco) dias, sob pena de cancelamento da distribuição (art. 290 do CPC)." },
    esperado: { tarefa: "custas", dias: 5, contagem: "uteis", dobro: false, vencimento: "2026-11-27" },
  },
  {
    id: "15-manifestar-sem-prazo",
    testa: "Juízo não fixou prazo: vale o art. 218, § 3º (5 dias).",
    intimacao: { ...civel, dataDisponibilizacao: "2026-11-19", texto: "Diga a parte autora sobre a petição de fls. 120 e documentos que a acompanham." },
    esperado: { tarefa: "manifestar", dias: 5, contagem: "uteis", dobro: false, vencimento: "2026-11-30" },
  },
  {
    id: "16-contrarrazoes-civel",
    testa: "Contrarrazões sem prazo escrito: 15 dias úteis.",
    intimacao: { ...civel, dataDisponibilizacao: "2026-11-23", texto: "Interposta apelação pela ré, intime-se o apelado para apresentar contrarrazões. Após, remetam-se os autos ao Tribunal." },
    esperado: { tarefa: "contrarrazoar", dias: 15, contagem: "uteis", dobro: false, vencimento: "2026-12-15" },
  },
  {
    id: "17-juizado-sentenca",
    testa: "Juizado especial: recurso inominado em 10 dias úteis.",
    intimacao: { ...juizado, dataDisponibilizacao: "2026-11-24", texto: "Dispensado o relatório (art. 38 da Lei 9.099/95). JULGO IMPROCEDENTE o pedido inicial. Sem custas e honorários nesta fase. Intimem-se." },
    esperado: { tarefa: "avaliar_recurso", dias: 10, contagem: "uteis", dobro: false, vencimento: "2026-12-09" },
  },
  {
    id: "18-fazenda-dobro",
    testa: "Fazenda Pública: prazo em dobro, dito no texto (15 × 2).",
    intimacao: { ...civel, orgao: "2ª Vara da Fazenda Pública de Curitiba", dataDisponibilizacao: "2026-11-03", texto: "Intime-se a Fazenda Pública do Estado do Paraná para, no prazo de 15 dias, manifestar-se sobre o pedido de cumprimento de sentença, observado o prazo em dobro (art. 183 do CPC)." },
    esperado: { tarefa: "manifestar", dias: 15, contagem: "uteis", dobro: true, vencimento: "2026-12-17" },
  },
  {
    id: "19-defensoria-dobro",
    testa: "Defensoria Pública: dobro sem a palavra \"dobro\" no texto.",
    intimacao: { ...civel, dataDisponibilizacao: "2026-11-04", texto: "Intime-se a Defensoria Pública, que assiste a parte ré, para especificar as provas que pretende produzir em 5 dias." },
    esperado: { tarefa: "especificar_provas", dias: 5, contagem: "uteis", dobro: true, vencimento: "2026-11-19" },
  },
  {
    id: "20-dias-uteis-escrito",
    testa: "\"Dias úteis\" escrito no texto, juntada de documentos.",
    intimacao: { ...civel, dataDisponibilizacao: "2026-11-25", texto: "Junte o autor aos autos cópia do contrato e dos comprovantes de pagamento, no prazo de 10 (dez) dias úteis." },
    esperado: { tarefa: "juntar_documentos", dias: 10, contagem: "uteis", dobro: false, vencimento: "2026-12-10" },
  },
  {
    id: "21-recesso",
    testa: "O prazo atravessa o recesso (20/12 a 20/01) e o Carnaval de 2027 (conferido à mão).",
    intimacao: { ...civel, dataDisponibilizacao: "2026-12-15", texto: "Manifeste-se a parte autora sobre a contestação, no prazo de 15 (quinze) dias." },
    esperado: { tarefa: "replica", dias: 15, contagem: "uteis", dobro: false, vencimento: "2027-02-10" },
  },
  {
    id: "22-feriado-local-cadastrado",
    testa: "Feriado local cadastrado pelo escritório empurra o vencimento (conferido à mão).",
    intimacao: { ...civel, dataDisponibilizacao: "2026-11-03", texto: "Encerrada a instrução. Apresentem as partes alegações finais por memoriais, no prazo sucessivo de 15 dias, a começar pela autora." },
    suspensoes: [{ id: "s1", inicio: "2026-11-16", fim: "2026-11-16", descricao: "Ponto facultativo no TJPR", tribunal: "TJPR" }],
    esperado: { tarefa: "alegacoes_finais", dias: 15, contagem: "uteis", dobro: false, vencimento: "2026-11-27" },
  },
  {
    id: "23-justica-federal",
    testa: "Justiça Federal: 08/12 (Lei 5.010) e o recesso no meio (conferido à mão).",
    intimacao: { tribunal: "TRF4", classe: "Procedimento Comum", orgao: "5ª Vara Federal de Curitiba", tipoDocumento: "Despacho", tipoComunicacao: "Intimação", dataDisponibilizacao: "2026-11-27", texto: "Juntado o laudo pericial, intimem-se as partes para manifestação sobre o laudo, no prazo de 15 dias." },
    esperado: { tarefa: "pericia", dias: 15, contagem: "uteis", dobro: false, vencimento: "2027-01-22" },
  },
  {
    id: "24-prazo-deferido",
    testa: "Prazo maior deferido a pedido da parte (30 dias).",
    intimacao: { ...civel, dataDisponibilizacao: "2026-11-26", texto: "Defiro o prazo de 30 (trinta) dias requerido pela parte autora para a juntada de documentos." },
    esperado: { tarefa: "juntar_documentos", dias: 30, contagem: "uteis", dobro: false, vencimento: "2027-02-12" },
  },
  {
    id: "25-acordao",
    testa: "Acórdão do TJ: recurso aos tribunais superiores em 15 dias úteis.",
    intimacao: { ...civel, orgao: "8ª Câmara Cível", classe: "Apelação Cível", tipoDocumento: "Acórdão", dataDisponibilizacao: "2026-11-30", texto: "ACORDAM os Desembargadores integrantes da 8ª Câmara Cível do Tribunal de Justiça do Estado do Paraná, por unanimidade de votos, em negar provimento ao recurso." },
    esperado: { tarefa: "avaliar_recurso", dias: 15, contagem: "uteis", dobro: false, vencimento: "2027-01-22" },
  },
  {
    id: "26-penal-memoriais",
    testa: "Penal, memoriais em 5 dias corridos.",
    intimacao: { ...penal, dataDisponibilizacao: "2026-11-25", texto: "Encerrada a instrução, apresente a defesa memoriais, no prazo de 5 (cinco) dias, nos termos do art. 403, § 3º, do CPP." },
    esperado: { tarefa: "alegacoes_finais", dias: 5, contagem: "corridos", dobro: false, vencimento: "2026-12-01" },
  },
  {
    id: "27-trabalho-contrarrazoes",
    testa: "Trabalho, contrarrazões sem prazo escrito: 8 dias úteis.",
    intimacao: { ...trabalho, dataDisponibilizacao: "2026-12-01", texto: "Recebo o recurso ordinário interposto pela reclamada. Intime-se o reclamante para, querendo, apresentar contrarrazões." },
    esperado: { tarefa: "contrarrazoar", dias: 8, contagem: "uteis", dobro: false, vencimento: "2026-12-14" },
  },
  {
    id: "28-embargos-declaracao",
    testa: "Embargos de declaração da outra parte: manifestação em 5 dias (art. 1.023, § 2º).",
    intimacao: { ...civel, dataDisponibilizacao: "2026-12-02", texto: "Opostos embargos de declaração pela ré com pedido de efeitos infringentes, intime-se a parte embargada para manifestação no prazo de 5 (cinco) dias (art. 1.023, § 2º, do CPC)." },
    esperado: { tarefa: "manifestar", dias: 5, contagem: "uteis", dobro: false, vencimento: "2026-12-10" },
  },
];
