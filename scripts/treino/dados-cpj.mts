/**
 * Treino com as decisões já tomadas e validadas no CPJ (direito securitário), tudo na sua máquina.
 * O formato do arquivo que o seu robô gera está em treino/formato-cpj.md.
 *
 *   1) validar: confere o arquivo, tira duplicadas e descartadas, reforça a anonimização e faz um relatório.
 *      node --experimental-strip-types scripts/treino/dados-cpj.mts validar --entrada C:\caminho\cpj.json
 *   2) montar: cria os exemplos de treino a partir do arquivo limpo.
 *      node --experimental-strip-types scripts/treino/dados-cpj.mts montar
 *
 * Tudo fica em treino/cpj/ (ignorada pelo git).
 * Dois treinos saem do mesmo arquivo:
 *   - prazos: a leitura do prazo (a mesma tarefa do Agente de Prazos), agora sabendo se o cliente é autor ou réu;
 *   - eventos: qual evento lançar no CPJ para aquela publicação.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { conferir, normalizarTexto, type DadosAgentePrazos, type LeituraPrazo } from "../../lib/prazos/agente-prazos.ts";
import { lerPrazoDoTexto } from "../../lib/prazos/calculo.ts";
import { TIPOS_TAREFA, type TipoTarefa } from "../../lib/tarefas.ts";
import { anonimizar, suspeitosPorTexto, type NomeConhecido } from "./dados-reais-prazos.mts";
import { comoConversa, type Exemplo } from "./gerar-exemplos-prazos.mts";

export type Lado = "autor" | "reu" | "terceiro" | "desconhecido";

export interface RegistroCpj {
  id: string;
  /** Identificador do processo já embaralhado (hash com sal). Usado para não misturar o mesmo processo no treino e no teste. */
  processo?: string;
  publicacao: DadosAgentePrazos & { texto: string };
  cliente?: { lado?: string; tipo?: string };
  /** Nomes a esconder (partes, advogados, segurado). Existem só neste arquivo de entrada; a saída não os guarda. */
  nomes?: string[];
  decisao?: { evento?: string; tarefa?: string; dias?: number; contagem?: string; dobro?: boolean; audiencia?: { data?: string; hora?: string } };
  situacao?: string;
}

const LADOS: Record<string, Lado> = { autor: "autor", reu: "reu", réu: "reu", terceiro: "terceiro", desconhecido: "desconhecido" };
export const rotuloLado = (l: Lado) => ({ autor: "autor", reu: "réu", terceiro: "terceiro interessado", desconhecido: "não identificado" })[l];

/** Anonimização reforçada para o ramo de seguros: apólice, sinistro, placa, proposta, endosso, RENAVAM, chassi. */
export function anonimizarSeguros(texto: string, nomes: string[]): string {
  const base = anonimizar(
    texto,
    nomes.map<NomeConhecido>((n) => ({ nome: n, rotulo: "[PARTE]" })),
  );
  return base
    .replace(/\b(ap[oó]lice|sinistro|proposta|endosso|certificado|contrato|ficha)\s*(?:n[ºo°.]*|número|numero)?\s*[:\-]?\s*[\dA-Z][\dA-Z./-]{4,}/gi, (_m, p: string) => `${p} [NÚMERO]`)
    .replace(/\b[A-Z]{3}-?\d[A-Z0-9]\d{2}\b/g, "[PLACA]")
    .replace(/\b[A-HJ-NPR-Z0-9]{17}\b/g, "[CHASSI]")
    .replace(/\brenavam\s*[:\-]?\s*\d{9,11}\b/gi, "RENAVAM [NÚMERO]");
}

export interface Rejeicoes {
  [motivo: string]: number;
}

export function limpar(entrada: RegistroCpj[]): { limpos: RegistroCpj[]; fora: Rejeicoes } {
  const fora: Rejeicoes = {};
  const nota = (m: string) => (fora[m] = (fora[m] ?? 0) + 1);
  const vistos = new Set<string>();
  const limpos: RegistroCpj[] = [];
  for (const r of entrada) {
    const texto0 = r?.publicacao?.texto ?? "";
    if (!r?.id || texto0.trim().length < 30) { nota("sem id ou texto"); continue; }
    if (normalizarTexto(r.situacao ?? "") !== "validada") { nota(`situação: ${r.situacao || "vazia"}`); continue; }
    if (!r.publicacao.dataDisponibilizacao || !/^\d{4}-\d{2}-\d{2}$/.test(r.publicacao.dataDisponibilizacao)) { nota("data inválida"); continue; }
    if (!r.decisao || (!r.decisao.evento && !r.decisao.tarefa)) { nota("sem decisão"); continue; }
    const texto = anonimizarSeguros(texto0, r.nomes ?? []);
    const lado = LADOS[normalizarTexto(r.cliente?.lado ?? "")] ?? "desconhecido";
    const chave = normalizarTexto(texto).replace(/\d+/g, "#") + "|" + lado;
    if (vistos.has(chave)) { nota("duplicada"); continue; }
    vistos.add(chave);
    const limpa = (s?: string) => (s ? anonimizarSeguros(s, r.nomes ?? []) : "");
    limpos.push({
      id: r.id,
      processo: r.processo,
      publicacao: { ...r.publicacao, texto, orgao: limpa(r.publicacao.orgao), classe: limpa(r.publicacao.classe) },
      cliente: { lado, tipo: r.cliente?.tipo },
      decisao: r.decisao,
      situacao: "validada",
    });
  }
  return { limpos, fora };
}

/** Separa por processo (quando existe), para o mesmo processo não cair no treino e no teste ao mesmo tempo. */
export function dividirPorGrupo<T extends { grupo: string }>(itens: T[], semente = 9): { treino: T[]; validacao: T[]; teste: T[] } {
  const h = (s: string) => {
    let x = semente >>> 0;
    for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619) >>> 0;
    return (x % 1000) / 1000;
  };
  const r = { treino: [] as T[], validacao: [] as T[], teste: [] as T[] };
  for (const i of itens) {
    const p = h(i.grupo);
    (p < 0.8 ? r.treino : p < 0.9 ? r.validacao : r.teste).push(i);
  }
  return r;
}

const PROMPT_EVENTOS = `Você ajuda um escritório de advocacia a lançar o evento certo no sistema de gestão (CPJ) para cada publicação do Diário de Justiça.
Responda só com JSON no formato {"evento": "<nome do evento>"}. Use o nome exato de um evento que o escritório já usa. Considere se o nosso cliente é autor ou réu na ação.`;

export function leituraDaDecisao(r: RegistroCpj): { leitura?: LeituraPrazo; motivo?: string } {
  const d = r.decisao;
  if (!d?.tarefa) return { motivo: "sem tarefa" };
  const tarefa = TIPOS_TAREFA.find((t) => t.tipo === d.tarefa)?.tipo as TipoTarefa | undefined;
  if (!tarefa) return { motivo: `tarefa desconhecida: ${d.tarefa}` };
  const dias = Number.isInteger(d.dias) ? (d.dias as number) : NaN;
  if (!(dias >= 0 && dias <= 60)) return { motivo: "dias inválidos" };
  if (d.contagem !== "uteis" && d.contagem !== "corridos") return { motivo: "contagem inválida" };
  const texto = r.publicacao.texto;
  const lido = lerPrazoDoTexto(texto);
  const fixado = !!lido && lido.dias === dias;
  const aud = d.audiencia;
  return {
    leitura: {
      tarefa,
      dias,
      contagem: d.contagem,
      dobro: d.dobro === true,
      prazoFixado: fixado,
      fundamento: fixado ? "Fixado pelo juízo" : dias === 0 ? "" : "Prazo legal",
      trecho: dias === 0 && tarefa !== "audiencia" ? texto.split(/(?<=[.;])\s/)[0].slice(0, 200).trim() : (lido?.trecho ?? texto.split(/(?<=[.;])\s/)[0].slice(0, 200).trim()),
      dataAudiencia: tarefa === "audiencia" ? (aud?.data ?? "") : "",
      horaAudiencia: tarefa === "audiencia" ? (aud?.hora ?? "") : "",
      confianca: "alta",
      observacao: "",
    },
  };
}

export function conversaPrazos(r: RegistroCpj, leitura: LeituraPrazo) {
  const ex: Exemplo = { familia: "cpj", dados: r.publicacao, leitura };
  const c = comoConversa(ex);
  const lado = rotuloLado((r.cliente?.lado as Lado) ?? "desconhecido");
  // Esta linha ainda não existe no Agente de Prazos em produção: o Clepsa precisará informar o lado do cliente.
  c.messages[1].content = c.messages[1].content.replace("\n\nLeia a publicação e responda.", `\nLado do nosso cliente: ${lado}\n\nLeia a publicação e responda.`);
  return c;
}

export function conversaEventos(r: RegistroCpj) {
  const p = r.publicacao;
  const lado = rotuloLado((r.cliente?.lado as Lado) ?? "desconhecido");
  const user = `<documento titulo="Publicação">\n${p.texto.slice(0, 20_000)}\n</documento>\n\nTribunal: ${p.tribunal || "não informado"}\nÓrgão: ${p.orgao || "não informado"}\nClasse: ${p.classe || "não informada"}\nTipo de documento: ${p.tipoDocumento || "não informado"}\nDisponibilizada em: ${p.dataDisponibilizacao}\nLado do nosso cliente: ${lado}${r.cliente?.tipo ? `\nTipo de cliente: ${r.cliente.tipo}` : ""}\n\nQual evento lançar?`;
  return { messages: [{ role: "system", content: PROMPT_EVENTOS }, { role: "user", content: user }, { role: "assistant", content: JSON.stringify({ evento: r.decisao!.evento }) }] };
}

function lerEntrada(caminho: string): RegistroCpj[] {
  const bruto = readFileSync(caminho, "utf8").replace(/^\uFEFF/, "").trim();
  if (bruto.startsWith("[")) return JSON.parse(bruto);
  return bruto.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

function validar(args: string[]) {
  const valor = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const entrada = valor("--entrada");
  if (!entrada) throw new Error('Faltou o arquivo: --entrada "C:\\caminho\\cpj.json"');
  const saida = valor("--saida") ?? "treino/cpj";
  const { limpos, fora } = limpar(lerEntrada(entrada));
  const suspeitos = suspeitosPorTexto(limpos.map((r) => r.publicacao.texto));
  const porLado: Record<string, number> = {};
  const porEvento: Record<string, number> = {};
  const porTarefa: Record<string, number> = {};
  for (const r of limpos) {
    porLado[r.cliente!.lado!] = (porLado[r.cliente!.lado!] ?? 0) + 1;
    if (r.decisao?.evento) porEvento[r.decisao.evento] = (porEvento[r.decisao.evento] ?? 0) + 1;
    if (r.decisao?.tarefa) porTarefa[r.decisao.tarefa] = (porTarefa[r.decisao.tarefa] ?? 0) + 1;
  }
  mkdirSync(saida, { recursive: true });
  writeFileSync(`${saida}/limpo.json`, JSON.stringify(limpos, null, 2));
  const amostra = [...limpos].sort((a, b) => (a.id < b.id ? -1 : 1)).filter((_, k) => k % Math.max(1, Math.floor(limpos.length / 20)) === 0).slice(0, 20);
  const comNome = suspeitos.filter((s) => s.length).length;
  const eventosRaros = Object.entries(porEvento).filter(([, n]) => n < 5).length;
  const relatorio = [
    `Registros no arquivo limpo: ${limpos.length}`,
    `Deixados de fora: ${JSON.stringify(fora)}`,
    `Lado do cliente: ${JSON.stringify(porLado)}`,
    `Tarefas: ${JSON.stringify(porTarefa)}`,
    `Eventos diferentes: ${Object.keys(porEvento).length} (${eventosRaros} com menos de 5 exemplos)`,
    `Textos com possível nome que sobrou: ${comNome}`,
    "",
    "== 20 textos para você olhar com atenção (procure nomes de pessoas, números de apólice, placas) ==",
    ...amostra.map((r, k) => `${k + 1}. [${r.cliente?.lado}] ${r.publicacao.texto.replace(/\s+/g, " ").slice(0, 400)}`),
  ].join("\n");
  writeFileSync(`${saida}/relatorio.txt`, relatorio);
  console.log(relatorio.split("\n").slice(0, 6).join("\n"));
  console.log(`\nLeia ${saida}/relatorio.txt (tem 20 textos para conferir) antes de seguir.`);
}

function montar(args: string[]) {
  const valor = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const pasta = valor("--saida") ?? "treino/cpj";
  const limpos = JSON.parse(readFileSync(`${pasta}/limpo.json`, "utf8")) as RegistroCpj[];
  const grava = (nome: string, l: unknown[]) => writeFileSync(`${pasta}/${nome}.jsonl`, l.map((x) => JSON.stringify(x)).join("\n") + (l.length ? "\n" : ""));

  // Prazos
  const fora: Rejeicoes = {};
  const nota = (m: string) => (fora[m] = (fora[m] ?? 0) + 1);
  const prazos: { grupo: string; conversa: ReturnType<typeof conversaPrazos> }[] = [];
  for (const r of limpos) {
    if (!r.decisao?.tarefa) continue;
    const { leitura, motivo } = leituraDaDecisao(r);
    if (!leitura) { nota(motivo!); continue; }
    const g = conferir(r.publicacao, leitura, [], r.publicacao.dataDisponibilizacao).alertas.find((a) => a.gravidade === "grave" && a.codigo !== "vencido");
    if (g) { nota(`conferente: ${g.codigo}`); continue; }
    prazos.push({ grupo: r.processo ?? r.id, conversa: conversaPrazos(r, leitura) });
  }
  const dp = dividirPorGrupo(prazos);
  grava("prazos-treino", dp.treino.map((x) => x.conversa));
  grava("prazos-validacao", dp.validacao.map((x) => x.conversa));
  grava("prazos-teste", dp.teste.map((x) => x.conversa));

  // Eventos
  const eventos = limpos.filter((r) => r.decisao?.evento).map((r) => ({ grupo: r.processo ?? r.id, conversa: conversaEventos(r) }));
  const de = dividirPorGrupo(eventos);
  grava("eventos-treino", de.treino.map((x) => x.conversa));
  grava("eventos-validacao", de.validacao.map((x) => x.conversa));
  grava("eventos-teste", de.teste.map((x) => x.conversa));

  console.log(`Prazos: ${prazos.length} exemplos (treino ${dp.treino.length}, validação ${dp.validacao.length}, teste ${dp.teste.length}). Ficaram de fora:`, fora);
  console.log(`Eventos: ${eventos.length} exemplos (treino ${de.treino.length}, validação ${de.validacao.length}, teste ${de.teste.length}).`);
  console.log(`Arquivos em ${pasta}/. O processo é dividido por inteiro: o mesmo processo nunca aparece no treino e no teste.`);
}

const executadoDireto = process.argv[1]?.endsWith("dados-cpj.mts");
if (executadoDireto) {
  const [cmd, ...resto] = process.argv.slice(2);
  try {
    if (cmd === "validar") validar(resto);
    else if (cmd === "montar") montar(resto);
    else console.log("Use: validar --entrada <arquivo.json>   ou   montar");
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
