import type { FaseProcesso } from "./processos.ts";

/**
 * Portal do cliente: um link secreto que o escritório manda ao cliente, para ele acompanhar os
 * processos dele sem criar conta. Só leitura, com o que o escritório escolheu mostrar.
 */
export interface LinkPortal {
  id: string;
  /** Nome do cliente como está nos processos. */
  cliente: string;
  /** Processos mostrados. Vazio: todos os processos deste cliente, inclusive os cadastrados depois. */
  processoIds: string[];
  titulo: string;
  /** Recado do escritório no topo do portal. */
  mensagem?: string;
  /** PDFs que o cliente pode baixar, por id do documento. */
  documentoIds: string[];
  mostrarAndamentos: boolean;
  /** Deixa o cliente mandar mensagem ao escritório (chega em Pedidos). */
  permitirMensagens: boolean;
  expiraEm: string;
  revogadoEm?: string;
  acessos: number;
  ultimoAcesso?: string;
  autorId: string;
  autorNome: string;
  criadoEm: string;
}

export interface ProcessoNoPortal {
  id: string;
  rotulo: string;
  numero?: string;
  fase: FaseProcesso;
  tribunal?: string;
  orgao?: string;
  classe?: string;
  andamentos: { dataHora: string; nome: string }[];
  /** Notas que o escritório marcou como visíveis ao cliente. */
  notas: { data: string; titulo: string; texto: string }[];
  documentos: { id: string; nome: string; tamanho: number }[];
}

export interface VisaoPortal {
  escritorio: string;
  titulo: string;
  mensagem?: string;
  cliente: string;
  processos: ProcessoNoPortal[];
  permitirMensagens: boolean;
  expiraEm: string;
  geradoEm: string;
}

export const LIMITES_PORTAL = { titulo: 150, mensagem: 2000, diasPadrao: 90, diasMaximo: 365, porEscritorio: 300 } as const;

/** Mesmo cliente, ignorando acento, caixa e espaços. */
export function mesmoCliente(a: string, b: string): boolean {
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  return n(a) === n(b);
}

export function linkAtivo(l: Pick<LinkPortal, "revogadoEm" | "expiraEm">, agora: Date): boolean {
  return !l.revogadoEm && Date.parse(l.expiraEm) > agora.getTime();
}
