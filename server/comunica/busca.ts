import { COMUNICA_ITENS_POR_PAGINA, dividirPeriodo, type ConsultaComunica, type IntimacaoImportada } from "../../lib/comunica.ts";

export interface PaginaComunica {
  total: number;
  itens: IntimacaoImportada[];
}

/** Busca uma página no Comunica. Lança erro com name "TimeoutError" quando a API demora demais. */
export type BuscarPagina = (consulta: ConsultaComunica) => Promise<PaginaComunica>;

export interface OpcoesBusca {
  /** Tamanho de cada janela do período, em dias. */
  diasPorJanela: number;
  /** Quantidade máxima de itens devolvidos. */
  maxItens: number;
  /** Tempo total disponível para a busca, em ms. */
  orcamentoMs: number;
  /** Esperas antes de repetir uma chamada que o Comunica recusou por estar ocupado. */
  esperasMs?: number[];
  agora?: () => number;
  esperar?: (ms: number) => Promise<void>;
}

export interface ResultadoBusca {
  total: number;
  itens: IntimacaoImportada[];
  truncado: boolean;
  /** Explica por que o resultado veio incompleto, quando for o caso. */
  aviso?: string;
}

/** Erro que interrompe a busca inteira (ex.: limite de requisições), sem resultado parcial útil. */
export class ErroComunica extends Error {
  status: number;
  /** Falha passageira (sistema ocupado, limite de requisições): vale repetir depois de esperar. */
  temporario: boolean;
  constructor(mensagem: string, status: number, temporario = false) {
    super(mensagem);
    this.status = status;
    this.temporario = temporario;
  }
}

const ehTimeout = (e: unknown) => e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
const ehTemporario = (e: unknown) => e instanceof ErroComunica && e.temporario;
/** Consulta pesada demais para o Comunica: vale tentar com um período menor. */
const ehPesada = (e: unknown) => ehTimeout(e) || (ehTemporario(e) && (e as ErroComunica).status !== 429);
const esperarPadrao = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Consulta o Comunica dividindo o período em janelas curtas, da mais recente para a mais antiga.
 * Se o Comunica disser que está ocupado, a chamada é repetida após uma espera.
 * Se uma janela demorar demais ou continuar recusada, ela é refeita dia a dia. Se mesmo assim o tempo acabar,
 * devolve o que já foi encontrado com `truncado: true` em vez de descartar tudo.
 */
export async function buscarEmJanelas(consulta: ConsultaComunica, buscarPagina: BuscarPagina, op: OpcoesBusca): Promise<ResultadoBusca> {
  const agora = op.agora ?? Date.now;
  const esperar = op.esperar ?? esperarPadrao;
  const esperas = op.esperasMs ?? [3_000, 8_000];
  const prazo = agora() + op.orcamentoMs;

  // Quando o Comunica diz que está ocupado, espera um pouco e tenta de novo antes de desistir.
  const comRepeticao: BuscarPagina = async (c) => {
    for (let tentativa = 0; ; tentativa++) {
      try {
        return await buscarPagina(c);
      } catch (e) {
        const espera = esperas[tentativa];
        if (!ehTemporario(e) || espera === undefined || agora() + espera >= prazo) throw e;
        await esperar(espera);
      }
    }
  };
  const fila = dividirPeriodo(consulta.dataInicio, consulta.dataFim, op.diasPorJanela);
  const itens: IntimacaoImportada[] = [];
  let total = 0;
  let aviso: string | undefined;
  let ultimoErro: unknown;

  while (fila.length) {
    if (itens.length >= op.maxItens) {
      aviso = `Mostrando as ${op.maxItens} comunicações mais recentes. Reduza o período para ver as demais.`;
      break;
    }
    if (agora() >= prazo) {
      aviso = "O Comunica PJe está lento; mostrando o que foi encontrado até agora. Reduza o período para ver o restante.";
      break;
    }
    const janela = fila.shift()!;
    try {
      for (let pagina = 1; ; pagina++) {
        const r = await comRepeticao({ ...consulta, dataInicio: janela.inicio, dataFim: janela.fim, pagina });
        if (pagina === 1) total += r.total;
        itens.push(...r.itens.slice(0, op.maxItens - itens.length));
        const lidos = (pagina - 1) * COMUNICA_ITENS_POR_PAGINA + r.itens.length;
        if (r.itens.length < COMUNICA_ITENS_POR_PAGINA || lidos >= r.total || itens.length >= op.maxItens) break;
        if (agora() >= prazo) break;
      }
    } catch (e) {
      if (ehPesada(e)) ultimoErro = e;
      if (ehPesada(e) && janela.inicio !== janela.fim) {
        // Janela pesada demais: refaz dia a dia, mantendo a ordem do mais recente para o mais antigo.
        fila.unshift(...dividirPeriodo(janela.inicio, janela.fim, 1));
        continue;
      }
      if (e instanceof ErroComunica && !itens.length) throw e;
      ultimoErro = e;
      aviso = ehPesada(e)
        ? "O Comunica PJe ficou sobrecarregado em parte do período; mostrando o que foi encontrado. Tente de novo mais tarde para completar."
        : "Parte do período não pôde ser consultada; mostrando o que foi encontrado.";
      break;
    }
  }

  // Nada encontrado e período incompleto por falha: é erro, não "zero resultados".
  if (!itens.length && aviso && ultimoErro) throw ultimoErro;
  const truncado = !!aviso || itens.length < total;
  return { total: Math.max(total, itens.length), itens, truncado, aviso };
}
