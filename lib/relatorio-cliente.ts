import { dataBR } from "./prazos/datas.ts";
import type { Intimacao, PessoaEquipe, StatusIntimacao } from "./types.ts";

export interface OpcoesRelatorio {
  cliente: string;
  /** Período das intimações recebidas, AAAA-MM-DD, inclusive. */
  inicio: string;
  fim: string;
  hoje: string;
  equipe?: PessoaEquipe[];
  /** O relatório vai para o cliente: observações internas e responsável só entram se pedido. */
  incluirObservacoes?: boolean;
  incluirResponsavel?: boolean;
}

export interface LinhaRelatorio {
  data: string;
  processo: string;
  tribunal: string;
  orgao: string;
  tipo: string;
  /** Resumo em duas linhas, ou o começo do texto quando não há resumo. */
  descricao: string;
  prazo?: string;
  situacao: string;
  responsavel?: string;
  observacoes?: string;
}

export interface RelatorioCliente {
  cliente: string;
  inicio: string;
  fim: string;
  totais: { recebidas: number; processos: number; respondidas: number; emAberto: number; vencidas: number };
  linhas: LinhaRelatorio[];
  /** Prazos em aberto do cliente a partir de hoje, de qualquer período. */
  proximosPrazos: { data: string; processo: string; tipo: string }[];
  /** Prazos em aberto que já passaram, de qualquer período. */
  vencidos: { data: string; processo: string; tipo: string }[];
}

const SITUACAO: Record<StatusIntimacao, string> = { nova: "Recebida", em_analise: "Em análise", respondida: "Providência tomada", arquivada: "Arquivada" };
const emAberto = (i: Intimacao) => i.status === "nova" || i.status === "em_analise";

function trecho(texto: string, limite = 220): string {
  const t = texto.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t.length > limite ? `${t.slice(0, limite).trimEnd()}…` : t;
}

/** Junta o que aconteceu com um cliente no período, no formato de prestação de contas. */
export function montarRelatorioCliente(intimacoes: Intimacao[], o: OpcoesRelatorio): RelatorioCliente {
  const doCliente = intimacoes.filter((i) => i.cliente === o.cliente);
  const doPeriodo = doCliente.filter((i) => i.dataDisponibilizacao >= o.inicio && i.dataDisponibilizacao <= o.fim).sort((a, b) => a.dataDisponibilizacao.localeCompare(b.dataDisponibilizacao) || a.numeroProcesso.localeCompare(b.numeroProcesso));
  const nomes = new Map((o.equipe ?? []).map((p) => [p.id, p.nome]));
  const abertasComPrazo = doCliente.filter((i) => emAberto(i) && i.prazo).sort((a, b) => a.prazo!.localeCompare(b.prazo!));
  const item = (i: Intimacao) => ({ data: i.prazo!, processo: i.numeroProcesso, tipo: i.tipoDocumento || i.tipoComunicacao });

  return {
    cliente: o.cliente,
    inicio: o.inicio,
    fim: o.fim,
    totais: {
      recebidas: doPeriodo.length,
      processos: new Set(doPeriodo.map((i) => i.numeroProcesso)).size,
      respondidas: doPeriodo.filter((i) => i.status === "respondida").length,
      emAberto: doPeriodo.filter(emAberto).length,
      vencidas: abertasComPrazo.filter((i) => i.prazo! < o.hoje).length,
    },
    linhas: doPeriodo.map((i) => ({
      data: i.dataDisponibilizacao,
      processo: i.numeroProcesso,
      tribunal: i.tribunal,
      orgao: i.orgao,
      tipo: i.tipoDocumento || i.tipoComunicacao,
      descricao: i.resumo?.texto ?? trecho(i.texto),
      prazo: i.prazo,
      situacao: SITUACAO[i.status] ?? i.status,
      responsavel: o.incluirResponsavel && i.responsavelId ? nomes.get(i.responsavelId) : undefined,
      observacoes: o.incluirObservacoes ? i.observacoes?.trim() || undefined : undefined,
    })),
    proximosPrazos: abertasComPrazo.filter((i) => i.prazo! >= o.hoje).map(item),
    vencidos: abertasComPrazo.filter((i) => i.prazo! < o.hoje).map(item),
  };
}

function html(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const periodo = (r: RelatorioCliente) => (r.inicio === r.fim ? dataBR(r.inicio) : `${dataBR(r.inicio)} a ${dataBR(r.fim)}`);

/** Relatório para imprimir ou salvar em PDF e mandar ao cliente. */
export function gerarHtmlRelatorioCliente(r: RelatorioCliente, ctx: { escritorio?: string; geradoEm: string }): string {
  const t = r.totais;
  const cartoes = [
    [t.recebidas, "intimação(ões) recebida(s)"],
    [t.processos, "processo(s) com movimento"],
    [t.respondidas, "com providência tomada"],
    [t.emAberto, "em andamento"],
  ]
    .map(([n, rotulo]) => `<div class="cartao"><b>${n}</b><span>${rotulo}</span></div>`)
    .join("");
  const extras = r.linhas.some((l) => l.responsavel) ? "<th>Responsável</th>" : "";
  const linhas = r.linhas
    .map(
      (l) => `<tr><td class="nw">${dataBR(l.data)}</td><td><span class="mono">${html(l.processo)}</span><br><small>${html([l.tribunal, l.orgao].filter(Boolean).join(" · "))}</small></td>
      <td>${html(l.tipo)}</td><td>${html(l.descricao).replace(/\n/g, "<br>")}${l.observacoes ? `<br><small><b>Obs.:</b> ${html(l.observacoes)}</small>` : ""}</td>
      <td class="nw">${l.prazo ? dataBR(l.prazo) : "—"}</td><td>${html(l.situacao)}</td>${extras ? `<td>${html(l.responsavel ?? "")}</td>` : ""}</tr>`,
    )
    .join("");
  const lista = (titulo: string, itens: RelatorioCliente["proximosPrazos"], classe = "") =>
    itens.length ? `<h2 class="${classe}">${titulo}</h2><ul>${itens.map((p) => `<li><b>${dataBR(p.data)}</b> · <span class="mono">${html(p.processo)}</span> · ${html(p.tipo)}</li>`).join("")}</ul>` : "";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${html(`Relatório ${r.cliente} · ${periodo(r)}`)}</title><style>
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body { font: 11px/1.45 "Segoe UI", Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; }
    header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
    h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 13px; margin: 18px 0 6px; } h2.alerta { color: #b91c1c; }
    .meta { color: #475569; text-align: right; font-size: 10px; }
    .cartoes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 6px; }
    .cartao { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; } .cartao b { display: block; font-size: 18px; } .cartao span { color: #475569; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; } thead { display: table-header-group; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; color: #475569; border-bottom: 1px solid #0f172a; padding: 5px 6px; }
    td { padding: 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; } tr { page-break-inside: avoid; }
    small { color: #64748b; } .mono { font-family: Consolas, "Courier New", monospace; } .nw { white-space: nowrap; }
    ul { margin: 0; padding-left: 18px; } li { margin: 2px 0; }
    footer { margin-top: 18px; color: #64748b; font-size: 9px; border-top: 1px solid #e2e8f0; padding-top: 6px; }
    .aviso { background: #fef3c7; border: 1px solid #fcd34d; padding: 8px 10px; margin-bottom: 12px; border-radius: 6px; }
    @media print { .aviso { display: none; } }
  </style></head><body>
  <div class="aviso">Use <strong>Ctrl+P</strong> (ou ⌘+P) e escolha <strong>Salvar como PDF</strong> para enviar ao cliente.</div>
  <header><div><h1>${html(r.cliente)}</h1><div>Relatório de intimações · ${periodo(r)}</div></div><div class="meta">${ctx.escritorio ? `${html(ctx.escritorio)}<br>` : ""}Emitido em ${html(ctx.geradoEm)}</div></header>
  <div class="cartoes">${cartoes}</div>
  ${lista("Prazos vencidos sem providência registrada", r.vencidos, "alerta")}
  ${lista("Próximos prazos", r.proximosPrazos)}
  <h2>Intimações do período</h2>
  ${r.linhas.length ? `<table><thead><tr><th>Data</th><th>Processo</th><th>Tipo</th><th>O que foi decidido</th><th>Prazo</th><th>Situação</th>${extras}</tr></thead><tbody>${linhas}</tbody></table>` : "<p>Nenhuma intimação publicada no período.</p>"}
  <footer>Datas de publicação conforme o Diário de Justiça Eletrônico Nacional. Relatório gerado pela Clepsa.</footer>
  <script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });</script>
  </body></html>`;
}

/** Texto curto para colar no corpo de um e-mail ao cliente. */
export function gerarTextoRelatorioCliente(r: RelatorioCliente): string {
  const t = r.totais;
  const partes = [
    `Relatório de intimações · ${r.cliente} · ${periodo(r)}`,
    "",
    `No período foram publicadas ${t.recebidas} intimação(ões) em ${t.processos} processo(s): ${t.respondidas} com providência tomada e ${t.emAberto} em andamento.`,
  ];
  if (r.proximosPrazos.length) partes.push("", "Próximos prazos:", ...r.proximosPrazos.map((p) => `- ${dataBR(p.data)}: processo ${p.processo} (${p.tipo})`));
  if (r.linhas.length) partes.push("", "Intimações do período:", ...r.linhas.map((l) => `- ${dataBR(l.data)} · ${l.processo} · ${l.tipo}: ${l.descricao.replace(/\n/g, " ")}`));
  return partes.join("\n");
}
