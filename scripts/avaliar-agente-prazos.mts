/**
 * Avaliação (evals) do Agente de Prazos: roda o agente nos casos de tests/evals e conta os acertos.
 *
 *   npm run avaliar:prazos             → só as regras do Clepsa (grátis, sem IA)
 *   npm run avaliar:prazos -- --ia     → com a IA (precisa de ANTHROPIC_API_KEY; mostra o custo)
 *   npm run avaliar:prazos -- --ia --caso 04   → só os casos cujo id começa com 04
 *
 * Termina com erro (código 1) se houver erro silencioso, para servir de trava antes de juntar
 * uma mudança nas instruções do agente.
 */
import { executarAgentePrazos } from "../server/ia/agente-prazos.ts";
import { IaClaude } from "../server/ia/ia.ts";
import { custoUsd, deUsoDaApi, type UsoIa } from "../server/ia/uso.ts";
import { CASOS } from "../tests/evals/agente-prazos.casos.ts";
import { avaliarCaso, placar, relatorio, type NotaCaso } from "../tests/evals/avaliar.ts";

const args = process.argv.slice(2);
const comIa = args.includes("--ia");
const filtro = args.includes("--caso") ? args[args.indexOf("--caso") + 1] : undefined;

const usos: UsoIa[] = [];
let ia: IaClaude | undefined;
if (comIa) {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) {
    console.error("Defina ANTHROPIC_API_KEY para avaliar com a IA (ou rode sem --ia para avaliar só as regras).");
    process.exit(2);
  }
  ia = new IaClaude({
    chave,
    modelo: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    modeloSimples: process.env.ANTHROPIC_MODEL_SIMPLES || "claude-haiku-5-5",
    anotarUso: async (funcao, modelo, usage) => {
      if (usage) usos.push(deUsoDaApi(funcao ?? "agente-prazos", modelo, usage));
    },
  });
}

const casos = CASOS.filter((c) => !filtro || c.id.startsWith(filtro));
const notas: NotaCaso[] = [];
let releituras = 0;
for (const c of casos) {
  try {
    // "Hoje" = dia da disponibilização, para nenhum caso parecer vencido.
    const p = await executarAgentePrazos({ ia, intimacao: c.intimacao, suspensoes: c.suspensoes ?? [], hoje: c.intimacao.dataDisponibilizacao });
    if (p.tentativas === 2) releituras++;
    notas.push(avaliarCaso(c, p));
  } catch (e) {
    console.error(`${c.id}: falhou (${e instanceof Error ? e.message : e})`);
    notas.push({ id: c.id, tarefa: false, dias: false, contagem: false, dobro: false, vencimento: false, acerto: false, erroSilencioso: false, erroConservador: false, situacao: "revisar", obtido: "falhou" });
  }
}

console.log(relatorio(notas, comIa ? `Agente de Prazos com IA (${ia!.modelo} relê; ${process.env.ANTHROPIC_MODEL_SIMPLES || "claude-haiku-5-5"} lê)` : "Agente de Prazos só com as regras (sem IA)"));
if (comIa) {
  const total = usos.reduce((s, u) => s + (custoUsd(u) ?? 0), 0);
  console.log(`Chamadas à IA: ${usos.length} (releituras: ${releituras}) · custo estimado: US$ ${total.toFixed(4)} · por publicação: US$ ${(total / Math.max(1, casos.length)).toFixed(5)}`);
}
if (placar(notas).errosSilenciosos > 0) process.exit(1);
