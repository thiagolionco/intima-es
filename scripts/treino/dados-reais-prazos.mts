/**
 * Usa intimações REAIS (do backup do Clepsa) para treinar o Agente de Prazos, sem sair da sua máquina.
 *
 *   1) preparar: lê o backup, esconde nomes e números e cria uma planilha para você conferir.
 *      node --experimental-strip-types scripts/treino/dados-reais-prazos.mts preparar --backup C:\caminho\backup.json [--ia]
 *
 *   2) montar: lê a planilha que você conferiu e cria os exemplos de treino.
 *      node --experimental-strip-types scripts/treino/dados-reais-prazos.mts montar
 *
 * Tudo fica em treino/reais/ (ignorada pelo git: nada disto vai para o GitHub).
 * Com --ia, a proposta de resposta vem do Claude (Haiku) e só o texto JÁ ANONIMIZADO é enviado.
 * Sem --ia, a proposta vem das regras do Clepsa (grátis, mas erra mais; você corrige).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { conferir, leituraPorRegras, normalizarTexto, trechoEstaNoTexto, type DadosAgentePrazos, type LeituraPrazo } from "../../lib/prazos/agente-prazos.ts";
import { lerPrazoDoTexto } from "../../lib/prazos/calculo.ts";
import { TIPOS_TAREFA, type TipoTarefa } from "../../lib/tarefas.ts";
import type { Intimacao } from "../../lib/types.ts";
import { comoConversa, dividir, type Exemplo } from "./gerar-exemplos-prazos.mts";

// ---------- anonimização ----------
const dobrar = (s: string) => s.split("").map((c) => c.normalize("NFD")[0].toLowerCase()).join("");

const PALAVRAS_COMUNS = new Set(
  "da de do das dos e ltda eireli epp mei sociedade banco empresa companhia comercio servicos servico industria associacao municipio estado uniao federal instituto fundacao brasil brasileiro nacional geral central grupo holding participacoes seguros financeira credito cooperativa unimed santa santo sao junior filho neto sobrinho silva".split(" "),
);

export interface NomeConhecido {
  nome: string;
  rotulo: string;
}

/** Troca nomes conhecidos e números de documentos por marcadores. Devolve o texto novo. */
export function anonimizar(texto: string, nomes: NomeConhecido[]): string {
  let t = texto;
  // Números e contatos (formatos com pontuação, para não pegar valores e prazos).
  t = t
    .replace(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g, "[PROCESSO]")
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[CPF]")
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, "[CNPJ]")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[EMAIL]")
    .replace(/\(\d{2}\)\s?\d{4,5}-?\d{4}/g, "[TELEFONE]")
    .replace(/\b\d{4,5}-\d{4}\b/g, "[TELEFONE]")
    .replace(/\b\d{5}-\d{3}\b/g, "[CEP]")
    .replace(/OAB[\s/-]*[A-Z]{2}[\s.:nº°-]*\d[\d.]*/gi, "[OAB]")
    .replace(/OAB[\s.:nº°-]*\d[\d.]*[\s/-]*[A-Z]{2}\b/gi, "[OAB]");

  // Nomes: o nome inteiro e depois cada palavra de 4+ letras que não seja comum.
  const pares: { agulha: string; rotulo: string }[] = [];
  for (const n of nomes) {
    const inteiro = dobrar(n.nome).replace(/\s+/g, " ").trim();
    if (inteiro.length >= 3) pares.push({ agulha: inteiro, rotulo: n.rotulo });
    for (const p of inteiro.split(" ")) if (p.length >= 4 && !PALAVRAS_COMUNS.has(p)) pares.push({ agulha: p, rotulo: n.rotulo });
  }
  pares.sort((a, b) => b.agulha.length - a.agulha.length);
  const faixas: { de: number; ate: number; rotulo: string }[] = [];
  const f = dobrar(t);
  for (const { agulha, rotulo } of pares) {
    const re = new RegExp(`(?<![a-z0-9])${agulha.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}(?![a-z0-9])`, "g");
    for (const m of f.matchAll(re)) {
      const de = m.index!;
      const ate = de + m[0].length;
      if (!faixas.some((x) => de < x.ate && ate > x.de)) faixas.push({ de, ate, rotulo });
    }
  }
  faixas.sort((a, b) => b.de - a.de);
  for (const x of faixas) t = t.slice(0, x.de) + x.rotulo + t.slice(x.ate);
  return t;
}

const NAO_E_NOME = new Set(
  "tribunal justica vara civel criminal federal estado uniao municipio codigo civil penal processo trabalho fazenda publica defensoria ministerio publico juizo juiz juizado especial camara turma seccao secao comarca foro regional superior supremo republica brasil direito prazo dias parte autora autor reu requerente requerido reclamante reclamada reclamado executado exequente embargante embargado apelante apelado agravante agravado recurso sentenca decisao despacho acordao intimacao citacao audiencia pericia laudo custas contestacao replica memoriais cpc cpp clt lei artigo art".split(" "),
);

/** Sequências de 2 ou mais palavras com inicial maiúscula que sobraram: possíveis nomes de pessoas. */
export function nomesQueSobraram(texto: string): string[] {
  const achados = new Set<string>();
  for (const m of texto.matchAll(/(?<![\p{L}])\p{Lu}\p{Ll}+(?:\s+(?:d[aeo]s?\s+)?\p{Lu}\p{Ll}+)+/gu)) {
    const palavras = dobrar(m[0]).split(/\s+/).filter((p) => !["da", "de", "do", "das", "dos"].includes(p));
    if (palavras.every((p) => NAO_E_NOME.has(p))) continue;
    if (palavras.some((p) => NAO_E_NOME.has(p)) && palavras.length <= 2) continue;
    achados.add(m[0]);
  }
  return [...achados].slice(0, 6);
}

/**
 * Para cada texto, os possíveis nomes que sobraram. Expressão que aparece em 4 ou mais textos diferentes
 * é nome de órgão, de lei ou fórmula do Diário (nome de pessoa quase nunca se repete tanto), então não conta.
 */
export function suspeitosPorTexto(textos: string[], minimo = 4): string[][] {
  const candidatos = textos.map((t) => nomesQueSobraram(t));
  const contagem = new Map<string, number>();
  for (const l of candidatos) for (const c of new Set(l)) contagem.set(c, (contagem.get(c) ?? 0) + 1);
  return candidatos.map((l) => l.filter((c) => (contagem.get(c) ?? 0) < minimo));
}

// ---------- planilha (CSV com ; e BOM, como o Excel em português) ----------
const celula = (v: unknown) => {
  const s = String(v ?? "").replace(/\r?\n/g, " ⏎ ");
  return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const paraCSV = (linhas: unknown[][]) => "\uFEFF" + linhas.map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";

export function lerCSV(conteudo: string): string[][] {
  const t = conteudo.replace(/^\uFEFF/, "");
  const sep = (t.split("\n")[0].match(/;/g)?.length ?? 0) >= (t.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let linha: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { atual += '"'; i++; }
      else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(atual); atual = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(atual); atual = "";
      if (linha.some((x) => x !== "")) linhas.push(linha);
      linha = [];
    } else atual += c;
  }
  if (atual !== "" || linha.length) { linha.push(atual); if (linha.some((x) => x !== "")) linhas.push(linha); }
  return linhas;
}

// ---------- preparar ----------
export interface Registro {
  id: string;
  dados: DadosAgentePrazos;
  proposta: LeituraPrazo;
  propostaPor: string;
  situacao: "confere" | "revisar";
  alertas: string[];
  sobraram: string[];
}

const SEGREDO = /segredo\s+de\s+justi|tramita\s+em\s+sigilo|sigilo\s+de\s+justi|segredo\s+de\s+justica/i;

export function anonimizarIntimacao(i: Intimacao): DadosAgentePrazos & { texto: string } {
  const nomes: NomeConhecido[] = [
    ...(i.partes ?? []).map((p) => ({ nome: p.nome, rotulo: p.polo === "A" ? "[AUTOR]" : p.polo === "P" ? "[RÉU]" : "[PARTE]" })),
    ...(i.advogados ?? []).map((a) => ({ nome: a.nome, rotulo: "[ADVOGADO]" })),
    ...(i.cliente ? [{ nome: i.cliente, rotulo: "[CLIENTE]" }] : []),
  ];
  const limpo = (s: string) => anonimizar(s ?? "", nomes);
  return {
    texto: limpo(i.texto),
    tribunal: i.tribunal,
    classe: limpo(i.classe),
    orgao: limpo(i.orgao),
    tipoDocumento: i.tipoDocumento,
    tipoComunicacao: i.tipoComunicacao,
    dataDisponibilizacao: i.dataDisponibilizacao,
  };
}

export function selecionar(intimacoes: Intimacao[]): { escolhidas: Intimacao[]; fora: Record<string, number> } {
  const fora: Record<string, number> = {};
  const nota = (m: string) => (fora[m] = (fora[m] ?? 0) + 1);
  const vistos = new Set<string>();
  const escolhidas: Intimacao[] = [];
  for (const i of intimacoes) {
    const texto = (i.texto ?? "").trim();
    if (texto.length < 40) { nota("sem texto"); continue; }
    if (SEGREDO.test(texto)) { nota("segredo de justiça"); continue; }
    const k = normalizarTexto(texto).replace(/\d+/g, "#");
    if (vistos.has(k)) { nota("texto repetido"); continue; }
    vistos.add(k);
    escolhidas.push(i);
  }
  return { escolhidas, fora };
}

const COLUNAS = ["id", "Tribunal", "Classe", "Tipo de documento", "Texto (sem nomes)", "Nomes que sobraram?", "Proposta: tarefa", "Proposta: dias", "Proposta: contagem", "Proposta: dobro", "Conferente", "Está certo? (S)", "Tarefa certa", "Dias certos", "Contagem certa", "Dobro certo (S/N)"];

async function preparar(args: string[]) {
  const valor = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const caminho = valor("--backup");
  if (!caminho) throw new Error('Faltou o backup: --backup "C:\\caminho\\backup-intimacoes.json" (Dados > Exportar backup).');
  const saida = valor("--saida") ?? "treino/reais";
  const comIa = args.includes("--ia");
  const limite = Number(valor("--maximo") ?? "500");
  const backup = JSON.parse(readFileSync(caminho, "utf8")) as { intimacoes?: Intimacao[] };
  const { escolhidas, fora } = selecionar(backup.intimacoes ?? []);
  const lote = escolhidas.slice(0, limite);

  let ia: import("../../server/ia/ia.ts").ServicoIa | undefined;
  let executar: typeof import("../../server/ia/agente-prazos.ts").executarAgentePrazos | undefined;
  if (comIa) {
    const chave = process.env.ANTHROPIC_API_KEY;
    if (!chave) throw new Error("Defina ANTHROPIC_API_KEY (ou rode sem --ia).");
    const { IaClaude } = await import("../../server/ia/ia.ts");
    ({ executarAgentePrazos: executar } = await import("../../server/ia/agente-prazos.ts"));
    const haiku = process.env.ANTHROPIC_MODEL_SIMPLES || "claude-haiku-5-5";
    ia = new IaClaude({ chave, modelo: process.env.ANTHROPIC_MODEL || haiku, modeloSimples: haiku });
  }

  const registros: Registro[] = [];
  for (const [n, i] of lote.entries()) {
    const dados = anonimizarIntimacao(i);
    let proposta: LeituraPrazo;
    let por = "regras";
    let situacao: Registro["situacao"];
    let alertas: string[];
    try {
      if (ia && executar) {
        const p = await executar({ ia, intimacao: dados, suspensoes: [], hoje: dados.dataDisponibilizacao });
        proposta = p.leitura; por = p.leitor; situacao = p.conferencia.situacao; alertas = p.conferencia.alertas.map((a) => a.texto);
      } else throw new Error("regras");
    } catch {
      proposta = leituraPorRegras(dados);
      const c = conferir(dados, proposta, [], dados.dataDisponibilizacao);
      situacao = c.situacao; alertas = c.alertas.map((a) => a.texto);
    }
    registros.push({ id: i.id, dados, proposta, propostaPor: por, situacao, alertas, sobraram: [] });
    if (ia) process.stdout.write(`  ${n + 1}/${lote.length}\r`);
  }

  suspeitosPorTexto(registros.map((r) => r.dados.texto)).forEach((l, k) => (registros[k].sobraram = l));
  mkdirSync(saida, { recursive: true });
  writeFileSync(`${saida}/reais.json`, JSON.stringify(registros, null, 2));
  // Quem precisa de mais atenção vem primeiro.
  const ordem = [...registros].sort((a, b) => Number(b.situacao === "revisar") - Number(a.situacao === "revisar") || b.sobraram.length - a.sobraram.length);
  const linhas: unknown[][] = [COLUNAS, ...ordem.map((r) => [r.id, r.dados.tribunal, r.dados.classe, r.dados.tipoDocumento, r.dados.texto, r.sobraram.join(" | "), r.proposta.tarefa, r.proposta.dias, r.proposta.contagem, r.proposta.dobro ? "S" : "N", r.situacao, "", "", "", "", ""])];
  writeFileSync(`${saida}/revisao.csv`, paraCSV(linhas));
  writeFileSync(
    `${saida}/legenda.txt`,
    [
      "Como preencher revisao.csv (abra no Excel; salve como CSV, não como .xlsx):",
      "- Coluna 'Texto (sem nomes)': se sobrou algum nome ou número de cliente, apague ou troque no próprio texto.",
      "- Se a proposta (colunas 'Proposta') está certa, escreva S em 'Está certo? (S)'.",
      "- Se está errada, preencha só o que está errado em 'Tarefa certa', 'Dias certos', 'Contagem certa' e 'Dobro certo'. Deixe em branco o que está certo.",
      "- Linhas que você não mexer ficam de fora do treino.",
      "",
      "Tarefas possíveis (escreva o nome da esquerda):",
      ...TIPOS_TAREFA.map((t) => `  ${t.tipo}  (${t.rotulo})`),
      "",
      "Dias: o prazo SEM dobrar. Use 0 quando a publicação não abre prazo (audiência, só ciência).",
      "Contagem: uteis ou corridos.",
    ].join("\n"),
  );
  console.log(`Preparadas ${registros.length} intimações em ${saida}/ (${comIa ? "propostas do Claude" : "propostas das regras"}).`);
  console.log("Deixadas de fora:", fora);
  console.log(`Com nomes que talvez sobraram: ${registros.filter((r) => r.sobraram.length).length}. Mandadas a revisar pelo conferente: ${registros.filter((r) => r.situacao === "revisar").length}.`);
  console.log(`Abra ${saida}/revisao.csv no Excel e siga ${saida}/legenda.txt.`);
}

// ---------- montar ----------
const sim = (v: string) => /^(s|sim|x|ok)$/i.test(v.trim());
const tarefaDe = (v: string): TipoTarefa | undefined => {
  const n = normalizarTexto(v).replace(/\s+/g, "_");
  return TIPOS_TAREFA.find((t) => t.tipo === n || normalizarTexto(t.rotulo).replace(/\s+/g, "_") === n)?.tipo;
};

export function corrigir(r: Registro, texto: string, linha: Record<string, string>): { leitura?: LeituraPrazo; motivo?: string } {
  const certo = sim(linha["Está certo? (S)"] ?? "");
  const tarefaTxt = (linha["Tarefa certa"] ?? "").trim();
  const diasTxt = (linha["Dias certos"] ?? "").trim();
  const contTxt = normalizarTexto(linha["Contagem certa"] ?? "");
  const dobroTxt = (linha["Dobro certo (S/N)"] ?? "").trim();
  const mexeu = tarefaTxt || diasTxt || contTxt || dobroTxt;
  if (!certo && !mexeu) return { motivo: "não revisada" };

  const l: LeituraPrazo = { ...r.proposta };
  if (tarefaTxt) {
    const t = tarefaDe(tarefaTxt);
    if (!t) return { motivo: `tarefa desconhecida: ${tarefaTxt}` };
    l.tarefa = t;
  }
  if (diasTxt) {
    const d = Number(diasTxt);
    if (!Number.isInteger(d) || d < 0 || d > 60) return { motivo: `dias inválidos: ${diasTxt}` };
    l.dias = d;
  }
  if (contTxt) {
    if (contTxt !== "uteis" && contTxt !== "corridos") return { motivo: `contagem inválida: ${contTxt}` };
    l.contagem = contTxt;
  }
  if (dobroTxt) l.dobro = sim(dobroTxt);

  const lido = lerPrazoDoTexto(texto);
  l.prazoFixado = !!lido && lido.dias === l.dias;
  l.fundamento = l.prazoFixado ? "Fixado pelo juízo" : l.dias === 0 ? "" : l.fundamento || "Prazo legal";
  if (!(l.trecho && trechoEstaNoTexto(l.trecho, texto) && l.dias === r.proposta.dias && l.tarefa === r.proposta.tarefa)) {
    l.trecho = (lido?.trecho ?? texto.split(/(?<=[.;])\s/)[0]).slice(0, 200).trim();
  }
  if (l.tarefa !== "audiencia") { l.dataAudiencia = ""; l.horaAudiencia = ""; }
  l.confianca = "alta";
  l.observacao = "";
  return { leitura: l };
}

function montar(args: string[]) {
  const valor = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const pasta = valor("--saida") ?? "treino/reais";
  const ignorarNomes = args.includes("--ignorar-nomes");
  const registros = JSON.parse(readFileSync(`${pasta}/reais.json`, "utf8")) as Registro[];
  const porId = new Map(registros.map((r) => [r.id, r]));
  const [cab, ...corpo] = lerCSV(readFileSync(`${pasta}/revisao.csv`, "utf8"));
  const col = (l: string[]): Record<string, string> => Object.fromEntries(cab.map((c, k) => [c, l[k] ?? ""]));
  const exemplos: Exemplo[] = [];
  const fora: Record<string, number> = {};
  const textosDaPlanilha = corpo.map((l) => (col(l)["Texto (sem nomes)"] ?? "").replace(/ ⏎ /g, "\n"));
  const suspeitos = suspeitosPorTexto(textosDaPlanilha);
  for (const [k, linha] of corpo.entries()) {
    const c = col(linha);
    const r = porId.get(c["id"]);
    if (!r) { fora["id desconhecido"] = (fora["id desconhecido"] ?? 0) + 1; continue; }
    const texto = (c["Texto (sem nomes)"] ?? "").replace(/ ⏎ /g, "\n").trim() || r.dados.texto;
    const { leitura, motivo } = corrigir(r, texto, c);
    if (!leitura) { fora[motivo!] = (fora[motivo!] ?? 0) + 1; continue; }
    if (!ignorarNomes && suspeitos[k].length) { fora["ainda tem nome no texto"] = (fora["ainda tem nome no texto"] ?? 0) + 1; continue; }
    const dados = { ...r.dados, texto };
    const g = conferir(dados, leitura, [], dados.dataDisponibilizacao).alertas.find((a) => a.gravidade === "grave" && a.codigo !== "vencido");
    if (g) { fora[`conferente: ${g.codigo}`] = (fora[`conferente: ${g.codigo}`] ?? 0) + 1; continue; }
    exemplos.push({ familia: "real", dados, leitura });
  }
  const d = dividir(exemplos, 5);
  const grava = (nome: string, l: Exemplo[]) => writeFileSync(`${pasta}/${nome}.jsonl`, l.map((e) => JSON.stringify(comoConversa(e))).join("\n") + (l.length ? "\n" : ""));
  grava("reais-treino", d.treino);
  grava("reais-validacao", d.validacao);
  grava("reais-teste", d.teste);
  console.log(`Exemplos reais prontos: ${exemplos.length} (treino ${d.treino.length}, validação ${d.validacao.length}, teste ${d.teste.length}) em ${pasta}/.`);
  console.log("Ficaram de fora:", fora);
  console.log("O 'reais-teste.jsonl' é o melhor teste que temos: são publicações de verdade que o modelo não viu.");
}

const executadoDireto = process.argv[1]?.endsWith("dados-reais-prazos.mts");
if (executadoDireto) {
  const [cmd, ...resto] = process.argv.slice(2);
  try {
    if (cmd === "preparar") await preparar(resto);
    else if (cmd === "montar") montar(resto);
    else console.log("Use: preparar --backup <arquivo.json> [--ia]   ou   montar");
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
