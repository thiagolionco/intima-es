import { cnjValido, diasParaPrescrever, type FaseProcesso, type Processo } from "../processos.ts";
import { pendenciasBloqueantes, itensDaEtapa } from "./checklist.ts";
import { etapa, indiceEtapa, proximaEtapa } from "./etapas.ts";
import { LIMITES_FLUXO, type FluxoProcesso } from "./modelo.ts";

/** O que o motor sabe sobre uma mudança de etapa pedida. */
export interface ContextoTransicao {
  processo: Processo;
  fluxo: FluxoProcesso;
  para: FaseProcesso;
  motivo?: string;
  /** AAAA-MM-DD. */
  hoje: string;
}

export interface Achado {
  regra: string;
  severidade: "bloqueio" | "aviso";
  mensagem: string;
  /** Item do checklist ou campo do cadastro que resolve o achado, para a tela apontar. */
  item?: string;
  campo?: keyof Processo | "motivo";
}

/** Uma regra olha uma transição e devolve o que encontrou (nada, se não se aplica). */
export interface Regra {
  id: string;
  avaliar(ctx: ContextoTransicao): Achado[];
}

const avanca = (ctx: ContextoTransicao) => indiceEtapa(ctx.para) > indiceEtapa(ctx.processo.fase);

/** Avança uma etapa por vez; voltar pode ir para qualquer anterior. */
export const umaEtapaPorVez: Regra = {
  id: "uma_etapa_por_vez",
  avaliar({ processo, para }) {
    if (para === processo.fase) return [{ regra: this.id, severidade: "bloqueio", mensagem: "O caso já está nesta etapa." }];
    if (indiceEtapa(para) - indiceEtapa(processo.fase) > 1) {
      return [{ regra: this.id, severidade: "bloqueio", mensagem: `Avance uma etapa por vez: o próximo passo é ${etapa(proximaEtapa(processo.fase)!).rotulo}.` }];
    }
    return [];
  },
};

/** Para avançar, os itens obrigatórios da etapa atual precisam estar feitos. */
export const checklistObrigatorio: Regra = {
  id: "checklist_obrigatorio",
  avaliar(ctx) {
    if (!avanca(ctx)) return [];
    return pendenciasBloqueantes(itensDaEtapa(ctx.processo, ctx.fluxo)).map((i) => ({
      regra: this.id,
      severidade: "bloqueio" as const,
      mensagem: i.automatico ? `${i.rotulo}${i.dica ? `: ${i.dica}` : ""}` : `Falta: ${i.rotulo}`,
      item: i.id,
    }));
  },
};

/** Dados do cadastro que cada etapa exige para entrar nela. */
export const camposDaEtapa: Regra = {
  id: "campos_da_etapa",
  avaliar({ processo: p, para }) {
    const achados: Achado[] = [];
    const falta = (campo: keyof Processo, mensagem: string) => achados.push({ regra: this.id, severidade: "bloqueio", mensagem, campo });
    if (indiceEtapa(para) >= indiceEtapa("elaboracao")) {
      if (!p.area) falta("area", "Informe a área de atuação no cadastro.");
      if (!p.tipo) falta("tipo", "Informe o tipo de demanda no cadastro.");
    }
    if (para === "correcao" && !p.responsavelId) falta("responsavelId", "Defina o responsável antes da correção.");
    if (para === "protocolado") {
      if (!p.numero) falta("numero", "Informe o número CNJ do processo protocolado.");
      else if (!cnjValido(p.numero)) falta("numero", "O número CNJ não confere.");
      if (!p.dataProtocolo) falta("dataProtocolo", "Informe a data do protocolo.");
    }
    return achados;
  },
};

/** Voltar de etapa exige dizer por quê: fica na trilha de auditoria. */
export const retornoComMotivo: Regra = {
  id: "retorno_com_motivo",
  avaliar(ctx) {
    if (avanca(ctx) || ctx.para === ctx.processo.fase) return [];
    const m = (ctx.motivo ?? "").trim();
    if (m.length < LIMITES_FLUXO.motivoMinimo) return [{ regra: this.id, severidade: "bloqueio", mensagem: `Para voltar de etapa, explique o motivo (mínimo de ${LIMITES_FLUXO.motivoMinimo} caracteres).`, campo: "motivo" }];
    if (m.length > LIMITES_FLUXO.motivo) return [{ regra: this.id, severidade: "bloqueio", mensagem: `O motivo passa de ${LIMITES_FLUXO.motivo} caracteres.`, campo: "motivo" }];
    return [];
  },
};

/** Não impede, mas alerta: prescrição vencida ou próxima. */
export const alertaDePrescricao: Regra = {
  id: "alerta_prescricao",
  avaliar({ processo, hoje }) {
    const dias = diasParaPrescrever(processo.prescricao, hoje);
    if (dias === undefined || processo.fase === "protocolado") return [];
    if (dias < 0) return [{ regra: this.id, severidade: "aviso", mensagem: `A prescrição venceu há ${-dias} dia(s).` }];
    if (dias <= 30) return [{ regra: this.id, severidade: "aviso", mensagem: `Prescreve em ${dias} dia(s).` }];
    return [];
  },
};

export const REGRAS_PADRAO: readonly Regra[] = [umaEtapaPorVez, camposDaEtapa, checklistObrigatorio, retornoComMotivo, alertaDePrescricao];
