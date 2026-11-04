/**
 * Como o Agente de Prazos é medido. Cada caso vira uma linha com cinco notas (tarefa, dias,
 * contagem, dobro e vencimento) e uma nota de SEGURANÇA, que é a mais importante:
 *
 *   erro silencioso = o vencimento saiu DEPOIS do certo (ou sumiu) E o conferente disse "confere".
 *
 * Errar e avisar ("revisar") é aceitável: o advogado olha. Errar calado para depois é o que perde
 * prazo. Errar calado para ANTES (ex.: esqueceu o dobro) é um erro conservador: ruim, mas não perde
 * prazo; é contado à parte. A meta do piloto é zero erro silencioso.
 */
import type { PropostaPrazo } from "../../lib/prazos/agente-prazos.ts";
import type { CasoAvaliacao } from "./agente-prazos.casos.ts";

export interface NotaCaso {
  id: string;
  tarefa: boolean;
  dias: boolean;
  contagem: boolean;
  dobro: boolean;
  vencimento: boolean;
  /** Tudo certo. */
  acerto: boolean;
  /** Vencimento depois do certo (ou ausente) sem aviso de "revisar": o erro que perde prazo. */
  erroSilencioso: boolean;
  /** Vencimento antes do certo sem aviso: o advogado só perde tempo. */
  erroConservador: boolean;
  situacao: "confere" | "revisar";
  obtido: string;
}

/** O obtido vence antes do esperado (ou foi criado prazo onde não havia): erro do lado seguro. */
const antes = (obtido: string | null, esperado: string | null) => (obtido !== null && esperado !== null ? obtido < esperado : esperado === null);

export function avaliarCaso(c: CasoAvaliacao, p: PropostaPrazo): NotaCaso {
  const e = c.esperado;
  const l = p.leitura;
  const tarefa = l.tarefa === e.tarefa;
  const dias = l.dias === e.dias;
  // Sem prazo, a contagem e o dobro não importam.
  const contagem = e.dias === 0 || l.contagem === e.contagem;
  const dobro = e.dias === 0 || l.dobro === e.dobro;
  const vencimentoObtido = p.conferencia.calculo?.fim ?? null;
  const vencimento = vencimentoObtido === e.vencimento && (!e.dataAudiencia || l.dataAudiencia === e.dataAudiencia);
  const situacao = p.conferencia.situacao;
  const prazo = l.dias ? `${l.dias}${l.dobro ? "x2" : ""} ${l.contagem}` : "sem prazo";
  return {
    id: c.id,
    tarefa,
    dias,
    contagem,
    dobro,
    vencimento,
    acerto: tarefa && dias && contagem && dobro && vencimento,
    erroSilencioso: !vencimento && situacao === "confere" && !antes(vencimentoObtido, e.vencimento),
    erroConservador: !vencimento && situacao === "confere" && antes(vencimentoObtido, e.vencimento),
    situacao,
    obtido: `${l.tarefa} · ${prazo} · ${vencimentoObtido ?? l.dataAudiencia ?? "—"}`,
  };
}

export interface Placar {
  casos: number;
  acertos: number;
  porCampo: Record<"tarefa" | "dias" | "contagem" | "dobro" | "vencimento", number>;
  errosSilenciosos: number;
  errosConservadores: number;
  /** Casos certos que o conferente mandou revisar à toa (alarme falso: cansa o advogado). */
  alarmesFalsos: number;
}

export function placar(notas: NotaCaso[]): Placar {
  const conta = (f: (n: NotaCaso) => boolean) => notas.filter(f).length;
  return {
    casos: notas.length,
    acertos: conta((n) => n.acerto),
    porCampo: { tarefa: conta((n) => n.tarefa), dias: conta((n) => n.dias), contagem: conta((n) => n.contagem), dobro: conta((n) => n.dobro), vencimento: conta((n) => n.vencimento) },
    errosSilenciosos: conta((n) => n.erroSilencioso),
    errosConservadores: conta((n) => n.erroConservador),
    alarmesFalsos: conta((n) => n.acerto && n.situacao === "revisar"),
  };
}

const pct = (n: number, total: number) => `${Math.round((100 * n) / Math.max(1, total))}%`;

export function relatorio(notas: NotaCaso[], titulo: string): string {
  const p = placar(notas);
  const marca = (b: boolean) => (b ? "✓" : "✗");
  const linhas = notas.map(
    (n) =>
      `${n.acerto ? "✓" : n.erroSilencioso ? "‼" : n.erroConservador ? "!" : "✗"} ${n.id.padEnd(28)} tarefa ${marca(n.tarefa)} dias ${marca(n.dias)} contagem ${marca(n.contagem)} dobro ${marca(n.dobro)} venc. ${marca(n.vencimento)}  [${n.situacao}]  ${n.acerto ? "" : n.obtido}`,
  );
  return [
    `== ${titulo} ==`,
    ...linhas,
    "",
    `Acerto total: ${p.acertos}/${p.casos} (${pct(p.acertos, p.casos)})`,
    `Por campo: tarefa ${pct(p.porCampo.tarefa, p.casos)} · dias ${pct(p.porCampo.dias, p.casos)} · contagem ${pct(p.porCampo.contagem, p.casos)} · dobro ${pct(p.porCampo.dobro, p.casos)} · vencimento ${pct(p.porCampo.vencimento, p.casos)}`,
    `Erros silenciosos (vencimento depois do certo, ou sem prazo, sem aviso): ${p.errosSilenciosos}  ← a meta é 0`,
    `Erros conservadores (vencimento antes do certo, sem aviso): ${p.errosConservadores}`,
    `Alarmes falsos (certo, mas mandou revisar): ${p.alarmesFalsos}`,
    "Legenda: ✓ certo · ✗ errado mas avisou · ! errado para antes sem avisar · ‼ errado para depois sem avisar",
  ].join("\n");
}
