import { AREA_LABEL, FASE_LABEL, formatarValor, POLO_CLIENTE_LABEL, type Processo, TIPO_DEMANDA_LABEL } from "../../lib/processos.ts";
import { formatProcesso } from "../../lib/utils.ts";
import { AppError } from "../core/errors.ts";
import type { DocumentosService } from "../processos/documentos.ts";
import type { ProcessoRepository } from "../processos/processos.ts";
import { idValido } from "../registros/registros.ts";
import type { BlocoIa } from "./ia.ts";

/** Soma dos PDFs de um pedido à IA (o pedido aceita até 32 MB, já em base64). */
export const LIMITE_BYTES_IA = 22 * 1024 * 1024;
export const LIMITE_DOCUMENTOS_IA = 20;

/** Dados do processo em texto, como a IA lê. */
export function descreverProcesso(p: Processo): string {
  return [
    p.numero ? `Número: ${formatProcesso(p.numero)}` : "Ainda sem número (não protocolado)",
    `Fase no escritório: ${FASE_LABEL[p.fase]}`,
    p.area && `Área: ${AREA_LABEL[p.area]}`,
    p.tipo && `Tipo: ${TIPO_DEMANDA_LABEL[p.tipo]}`,
    `Cliente do escritório: ${p.cliente} (${POLO_CLIENTE_LABEL[p.polo]})`,
    p.parteContraria && `Parte contrária: ${p.parteContraria}`,
    p.tribunal && `Tribunal: ${p.tribunal}`,
    p.orgao && `Órgão julgador: ${p.orgao}`,
    p.comarca && `Comarca: ${p.comarca}`,
    p.classe && `Classe: ${p.classe}`,
    p.dataAtendimento && `Atendimento em: ${p.dataAtendimento}`,
    p.prescricao && `Prescrição em: ${p.prescricao}`,
    p.dataProtocolo && `Protocolado em: ${p.dataProtocolo}`,
    p.valorCausa !== undefined && `Valor da causa: ${formatarValor(p.valorCausa)}`,
    p.observacoes && `Observações do escritório: ${p.observacoes}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface ContextoCarregado {
  processo: Processo;
  /** PDFs enviados, na ordem (a IA cita pela posição, começando em 1). */
  documentos: { id: string; nome: string }[];
  blocos: BlocoIa[];
}

/** Carrega o processo e os PDFs mais recentes, até o limite do pedido, como blocos para a IA. */
export class ContextoProcesso {
  private readonly processos: ProcessoRepository;
  private readonly documentos: DocumentosService;

  constructor(d: { processos: ProcessoRepository; documentos: DocumentosService }) {
    this.processos = d.processos;
    this.documentos = d.documentos;
  }

  async processo(usuarioId: string, processoId: string): Promise<Processo> {
    const p = idValido(processoId) ? await this.processos.porId(usuarioId, processoId) : null;
    if (!p) throw new AppError("nao_encontrado", "Processo não encontrado.");
    return p;
  }

  /** PDFs do processo, só os metadados. */
  async listarPdfs(usuarioId: string, processoId: string) {
    await this.processo(usuarioId, processoId);
    return this.documentos.listar(usuarioId, processoId);
  }

  async carregar(usuarioId: string, processoId: string, op: { exigirPdf?: boolean; limiteBytes?: number } = {}): Promise<ContextoCarregado> {
    const processo = await this.processo(usuarioId, processoId);
    const limite = op.limiteBytes ?? LIMITE_BYTES_IA;
    const escolhidos: { id: string; nome: string; tamanho: number }[] = [];
    let total = 0;
    for (const d of await this.documentos.listar(usuarioId, processoId)) {
      if (escolhidos.length >= LIMITE_DOCUMENTOS_IA) break;
      if (total + d.tamanho > limite) continue;
      escolhidos.push(d);
      total += d.tamanho;
    }
    if (op.exigirPdf && !escolhidos.length) {
      throw new AppError("dados_invalidos", `Anexe ao menos um PDF de até ${Math.round(limite / (1024 * 1024))} MB ao processo para a IA ler.`);
    }
    const blocos: BlocoIa[] = [];
    for (const [i, d] of escolhidos.entries()) {
      blocos.push({ tipo: "pdf", titulo: `${i + 1}. ${d.nome}`, bytes: (await this.documentos.abrir(usuarioId, processoId, d.id)).bytes });
    }
    blocos.push({
      tipo: "texto",
      texto: `Dados do processo:\n${descreverProcesso(processo)}\n\n${
        escolhidos.length ? `PDFs do processo, na ordem:\n${escolhidos.map((d, i) => `${i + 1}. ${d.nome}`).join("\n")}` : "Nenhum PDF do processo foi anexado."
      }`,
    });
    return { processo, documentos: escolhidos.map(({ id, nome }) => ({ id, nome })), blocos };
  }
}

/** Confere a página citada pela IA: documento pela posição (1, 2…) e página a partir de 1. */
export function fonteValida(documentos: { id: string; nome: string }[], documento: unknown, pagina: unknown): { documentoId: string; documentoNome: string; pagina: number } | undefined {
  const doc = Number.isInteger(documento) ? documentos[(documento as number) - 1] : undefined;
  if (!doc || !Number.isInteger(pagina) || (pagina as number) < 1) return undefined;
  return { documentoId: doc.id, documentoNome: doc.nome, pagina: pagina as number };
}

/** Executa só uma vez por chave ao mesmo tempo nesta instância (evita pagar duas vezes pelo mesmo clique). */
export class Exclusivo {
  private readonly emAndamento = new Set<string>();
  async executar<R>(chave: string, mensagem: string, fn: () => Promise<R>): Promise<R> {
    if (this.emAndamento.has(chave)) throw new AppError("conflito", mensagem);
    this.emAndamento.add(chave);
    try {
      return await fn();
    } finally {
      this.emAndamento.delete(chave);
    }
  }
}

/** Erro da IA para o usuário, com o detalhe só no log do servidor. */
export function falhaDaIa(onde: string, e: unknown, mensagem = "A IA não conseguiu concluir agora. Tente de novo em alguns minutos."): AppError {
  if (e instanceof AppError) return e;
  console.error(`[${onde}] falha da IA:`, e instanceof Error ? e.message : e);
  return new AppError("indisponivel", mensagem);
}

export const semIa = (oQue: string) => new AppError("indisponivel", `${oQue} pela IA não está ligada neste servidor.`);
