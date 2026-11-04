/**
 * Avaliação (evals) do Agente de Prazos: roda o agente nos casos de tests/evals e conta os acertos.
 *
 *   npm run avaliar:prazos             → só as regras do Clepsa (grátis, sem IA)
 *   npm run avaliar:prazos -- --ia     → com a IA (precisa de ANTHROPIC_API_KEY; mostra o custo)
 *   npm run avaliar:prazos -- --ia --caso 04   → só os casos cujo id começa com 04
 *
 * IA local (Ollama, no próprio computador, grátis; ver docs/ia-local-ollama.md):
 *   npm run avaliar:prazos -- --ollama qwen2.5:3b
 *   npm run avaliar:prazos -- --ollama qwen2.5:3b,qwen2.5:7b     → dois modelos, um depois do outro
 *   npm run avaliar:prazos -- --ollama qwen2.5:3b --releitura qwen2.5:7b
 *       → o 3b lê; quando o conferente reprova, o 7b relê (como Haiku → Sonnet)
 *   npm run avaliar:prazos -- --ollama qwen2.5:3b --ia          → compara com o Claude no fim
 *   --ollama-url http://outro-pc:11434   → Ollama em outro endereço
 *   --salvar resultado.json              → grava as notas de cada caso num arquivo
 *
 * Quando há IA na rodada, as regras rodam junto e o fim mostra uma tabela comparando todos.
 * Os casos são publicações fictícias (nenhum dado de cliente). Termina com erro (código 1) se
 * houver erro silencioso, para servir de trava antes de juntar uma mudança nas instruções do agente.
 */
import { writeFileSync } from "node:fs";
import { executarAgentePrazos } from "../server/ia/agente-prazos.ts";
import { IaClaude, type ServicoIa } from "../server/ia/ia.ts";
import { IaOllama } from "../server/ia/ia-ollama.ts";
import { custoUsd, deUsoDaApi, type UsoIa } from "../server/ia/uso.ts";
import { CASOS } from "../tests/evals/agente-prazos.casos.ts";
import { avaliarCaso, placar, relatorio, type NotaCaso, type Placar } from "../tests/evals/avaliar.ts";

const args = process.argv.slice(2);
const valor = (nome: string) => (args.includes(nome) ? args[args.indexOf(nome) + 1] : undefined);
const comIa = args.includes("--ia");
const filtro = valor("--caso");
const modelosOllama = (valor("--ollama") ?? "").split(",").map((m) => m.trim()).filter(Boolean);
const releituraOllama = valor("--releitura");
const urlOllama = valor("--ollama-url") ?? process.env.OLLAMA_URL;
const arquivo = valor("--salvar");

interface Rodada {
  nome: string;
  ia?: ServicoIa;
  /** Só para o Claude: soma o custo no fim. */
  usos?: UsoIa[];
}

const rodadas: Rodada[] = [{ nome: "Regras do Clepsa (sem IA)" }];

for (const m of modelosOllama) {
  const ia = new IaOllama({ modelo: releituraOllama ?? m, modeloSimples: m, url: urlOllama });
  const problema = await ia.verificar();
  if (problema) {
    console.error(problema);
    process.exit(2);
  }
  rodadas.push({ nome: releituraOllama ? `Ollama ${m} lê, ${releituraOllama} relê` : `Ollama ${m}`, ia });
}

if (comIa) {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) {
    console.error("Defina ANTHROPIC_API_KEY para avaliar com o Claude (ou rode sem --ia).");
    process.exit(2);
  }
  const usos: UsoIa[] = [];
  const modelo = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  const simples = process.env.ANTHROPIC_MODEL_SIMPLES || "claude-haiku-5-5";
  const ia = new IaClaude({
    chave,
    modelo,
    modeloSimples: simples,
    anotarUso: async (funcao, m, usage) => {
      if (usage) usos.push(deUsoDaApi(funcao ?? "agente-prazos", m, usage));
    },
  });
  rodadas.push({ nome: simples === modelo ? `Claude ${modelo}` : `Claude (${simples} lê, ${modelo} relê)`, ia, usos });
}

// Só as regras, sem nenhuma IA: o relatório de sempre.
const soRegras = rodadas.length === 1;
const casos = CASOS.filter((c) => !filtro || c.id.startsWith(filtro));
const resultados: { nome: string; placar: Placar; releituras: number; segundosPorCaso: number; custoUsd?: number; notas: NotaCaso[] }[] = [];

for (const r of rodadas) {
  if (!soRegras) console.log(`\nRodando: ${r.nome} (${casos.length} casos)...`);
  const notas: NotaCaso[] = [];
  let releituras = 0;
  const inicio = Date.now();
  for (const [n, c] of casos.entries()) {
    try {
      // "Hoje" = dia da disponibilização, para nenhum caso parecer vencido.
      const p = await executarAgentePrazos({ ia: r.ia, intimacao: c.intimacao, suspensoes: c.suspensoes ?? [], hoje: c.intimacao.dataDisponibilizacao });
      if (p.tentativas === 2) releituras++;
      notas.push(avaliarCaso(c, p));
    } catch (e) {
      console.error(`${c.id}: falhou (${e instanceof Error ? e.message : e})`);
      notas.push({ id: c.id, tarefa: false, dias: false, contagem: false, dobro: false, vencimento: false, acerto: false, erroSilencioso: false, erroConservador: false, situacao: "revisar", obtido: "falhou" });
    }
    if (r.ia && !r.usos) process.stdout.write(`  ${n + 1}/${casos.length}\r`);
  }
  const segundosPorCaso = (Date.now() - inicio) / 1000 / Math.max(1, casos.length);
  console.log(relatorio(notas, r.nome));
  let custo: number | undefined;
  if (r.usos) {
    custo = r.usos.reduce((s, u) => s + (custoUsd(u) ?? 0), 0);
    console.log(`Chamadas à IA: ${r.usos.length} (releituras: ${releituras}) · custo estimado: US$ ${custo.toFixed(4)} · por publicação: US$ ${(custo / Math.max(1, casos.length)).toFixed(5)}`);
  } else if (r.ia) {
    console.log(`Releituras: ${releituras} · tempo médio: ${segundosPorCaso.toFixed(1)} s por publicação · custo: zero (roda no seu computador)`);
  }
  resultados.push({ nome: r.nome, placar: placar(notas), releituras, segundosPorCaso, custoUsd: custo, notas });
}

if (!soRegras) {
  const col = (s: string | number, n: number) => String(s).padEnd(n);
  const larg = Math.max(28, ...resultados.map((r) => r.nome.length + 2));
  console.log("\n== Comparação ==");
  console.log(`${col("Leitor", larg)}${col("Acertos", 10)}${col("Silenc.‼", 10)}${col("Conserv.!", 11)}${col("Alarme falso", 14)}${col("s/publ.", 9)}Custo`);
  for (const r of resultados) {
    const p = r.placar;
    const custo = r.custoUsd !== undefined ? `US$ ${r.custoUsd.toFixed(4)}` : r.nome.startsWith("Regras") ? "zero" : "zero (local)";
    console.log(
      `${col(r.nome, larg)}${col(`${p.acertos}/${p.casos}`, 10)}${col(p.errosSilenciosos, 10)}${col(p.errosConservadores, 11)}${col(p.alarmesFalsos, 14)}${col(r.nome.startsWith("Regras") ? "—" : r.segundosPorCaso.toFixed(1), 9)}${custo}`,
    );
  }
  console.log("Silenc.‼ = vencimento depois do certo sem avisar (perde prazo; a meta é 0). Conserv.! = antes do certo sem avisar.");
}

if (arquivo) {
  writeFileSync(arquivo, JSON.stringify({ quando: new Date().toISOString(), resultados }, null, 2));
  console.log(`\nResultado gravado em ${arquivo}`);
}

if (resultados.some((r) => r.placar.errosSilenciosos > 0)) process.exit(1);
