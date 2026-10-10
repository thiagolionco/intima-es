"use client";

import clsx from "clsx";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardCopy,
  Columns3,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Printer,
  Settings2,
  Sheet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";
import { useUsuario } from "@/lib/auth/sessao";
import { COLUNAS, FORMATACAO_PADRAO, montarTabela, PRESETS, type OpcoesFormatacao } from "@/lib/exportacao/colunas";
import { FORMATOS, nomeArquivoSeguro, tabelaParaTsv, type ContextoExportacao } from "@/lib/exportacao/formatos";
import type { Intimacao } from "@/lib/types";
import { hojeISO } from "@/lib/utils";

export interface ConjuntoExportacao {
  id: string;
  rotulo: string;
  descricao: string;
  itens: Intimacao[];
}

interface Preferencias {
  formato: string;
  colunas: string[];
  formatacao: OpcoesFormatacao;
  incluirCabecalho: boolean;
  separadorCsv: ContextoExportacao["separadorCsv"];
  bomUtf8: boolean;
}

const PADRAO: Preferencias = {
  formato: "xlsx",
  colunas: PRESETS[0].colunas,
  formatacao: FORMATACAO_PADRAO,
  incluirCabecalho: true,
  separadorCsv: ";",
  bomUtf8: true,
};

const ICONES: Record<string, LucideIcon> = { xlsx: FileSpreadsheet, csv: Sheet, pdf: Printer, json: FileJson };

function chavePreferencias(usuarioId: string) {
  return `controle-intimacoes:exportacao:${usuarioId}`;
}

function lerPreferencias(usuarioId: string): Preferencias {
  try {
    const p = JSON.parse(localStorage.getItem(chavePreferencias(usuarioId)) || "null") as Preferencias | null;
    if (!p) return PADRAO;
    return { ...PADRAO, ...p, colunas: p.colunas.filter((c) => COLUNAS.some((x) => x.id === c)), formatacao: { ...FORMATACAO_PADRAO, ...p.formatacao } };
  } catch {
    return PADRAO;
  }
}

function Secao({ icone: Icone, titulo, children, extra }: { icone: LucideIcon; titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Icone className="h-3.5 w-3.5" /> {titulo}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Alternador({ checked, onChange, rotulo, dica }: { checked: boolean; onChange: (v: boolean) => void; rotulo: string; dica?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span>
        <span className="block text-sm text-slate-700">{rotulo}</span>
        {dica && <span className="block text-xs text-slate-400">{dica}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition", checked ? "bg-brand-600" : "bg-slate-300")}
      >
        <span className={clsx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
    </label>
  );
}

/**
 * Central de exportação: escopo, formato, colunas (com ordem), formatação, nome do arquivo e
 * pré-visualização ao vivo. As preferências ficam salvas por usuário neste navegador.
 */
export function DialogoExportacao({ aberto, onFechar, conjuntos, conjuntoInicial }: { aberto: boolean; onFechar: () => void; conjuntos: ConjuntoExportacao[]; conjuntoInicial?: string }) {
  const usuario = useUsuario();
  const { toast } = useToast();
  const [conjuntoId, setConjuntoId] = useState(conjuntoInicial ?? conjuntos[0]?.id);
  const [prefs, setPrefs] = useState<Preferencias>(PADRAO);
  const [nome, setNome] = useState("");
  const [lembrar, setLembrar] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const painel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    setPrefs(lerPreferencias(usuario.id));
    setConjuntoId(conjuntoInicial ?? conjuntos.find((c) => c.itens.length)?.id ?? conjuntos[0]?.id);
    setNome(`intimacoes-${hojeISO()}`);
    setCopiado(false);
    const anterior = document.activeElement as HTMLElement | null;
    painel.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("keydown", esc);
      anterior?.focus?.();
    };
    // Reinicia só ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const conjunto = conjuntos.find((c) => c.id === conjuntoId) ?? conjuntos[0];
  const formato = FORMATOS.find((f) => f.id === prefs.formato) ?? FORMATOS[0];
  const tabela = useMemo(() => montarTabela(conjunto?.itens ?? [], prefs.colunas, prefs.formatacao), [conjunto, prefs.colunas, prefs.formatacao]);
  const previa = useMemo(() => montarTabela((conjunto?.itens ?? []).slice(0, 5), prefs.colunas, prefs.formatacao), [conjunto, prefs.colunas, prefs.formatacao]);
  const presetAtivo = PRESETS.find((p) => p.colunas.length === prefs.colunas.length && p.colunas.every((c, i) => prefs.colunas[i] === c))?.id;

  if (!aberto) return null;

  const set = <K extends keyof Preferencias>(k: K, v: Preferencias[K]) => setPrefs((p) => ({ ...p, [k]: v }));
  const alternarColuna = (id: string) =>
    set("colunas", prefs.colunas.includes(id) ? prefs.colunas.filter((c) => c !== id) : [...prefs.colunas, id].sort((a, b) => ordemAtual(a) - ordemAtual(b)));
  // Colunas novas entram na posição do catálogo, respeitando a ordem já escolhida.
  const ordemAtual = (id: string) => {
    const i = prefs.colunas.indexOf(id);
    return i >= 0 ? i : COLUNAS.findIndex((c) => c.id === id) + 0.5;
  };
  const mover = (id: string, delta: number) => {
    const i = prefs.colunas.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= prefs.colunas.length) return;
    const nova = [...prefs.colunas];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    set("colunas", nova);
  };
  const colunasOrdenadas = [...prefs.colunas.map((id) => COLUNAS.find((c) => c.id === id)!).filter(Boolean), ...COLUNAS.filter((c) => !prefs.colunas.includes(c.id))];

  const contexto: ContextoExportacao = {
    titulo: `Intimações — ${conjunto?.rotulo ?? ""}`,
    metadados: [`${usuario.nome}${usuario.escritorio ? ` · ${usuario.escritorio}` : ""}`, conjunto?.descricao ?? "", `Gerado em ${new Date().toLocaleString("pt-BR")}`].filter(Boolean),
    incluirCabecalho: prefs.incluirCabecalho,
    separadorCsv: prefs.separadorCsv,
    bomUtf8: prefs.bomUtf8,
  };

  const podeExportar = !!conjunto?.itens.length && prefs.colunas.length > 0;

  function salvarPreferencias() {
    try {
      if (lembrar) localStorage.setItem(chavePreferencias(usuario.id), JSON.stringify(prefs));
    } catch {}
  }

  function exportar() {
    if (!podeExportar) return;
    const conteudo = formato.gerar(tabela, contexto);
    const blob = new Blob([conteudo as BlobPart], { type: formato.mime });
    const url = URL.createObjectURL(blob);
    if (formato.entrega === "imprimir") {
      const janela = window.open(url, "_blank");
      if (!janela) {
        toast("Permita pop-ups para gerar o PDF", { tom: "error", descricao: "O navegador bloqueou a janela do relatório." });
        return;
      }
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivoSeguro(nome, formato.extensao);
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    salvarPreferencias();
    toast(formato.entrega === "imprimir" ? "Relatório aberto para impressão" : `${formato.rotulo} exportado`, {
      descricao: `${tabela.linhas.length} intimação(ões) · ${prefs.colunas.length} coluna(s)`,
    });
    onFechar();
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(tabelaParaTsv(tabela, prefs.incluirCabecalho));
      setCopiado(true);
      salvarPreferencias();
      toast("Copiado para a área de transferência", { descricao: "Cole direto no Excel, Google Planilhas ou e-mail." });
    } catch {
      toast("Não foi possível copiar", { tom: "error" });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/50 backdrop-blur-[2px]" onClick={onFechar} aria-hidden />
      <div
        ref={painel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-exportacao"
        className="relative flex max-h-[94vh] w-full max-w-5xl animate-slide-in flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="titulo-exportacao" className="text-lg font-semibold text-slate-900">
              Exportar intimações
            </h2>
            <p className="text-sm text-slate-500">Escolha o que, como e em que formato. A pré-visualização mostra o resultado em tempo real.</p>
          </div>
          <button onClick={onFechar} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:overflow-hidden">
          {/* Configurações */}
          <div className="space-y-7 overflow-y-auto border-slate-200 p-6 lg:border-r">
            <Secao icone={FileText} titulo="O que exportar">
              <div className="grid gap-2 sm:grid-cols-3">
                {conjuntos.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!c.itens.length}
                    onClick={() => setConjuntoId(c.id)}
                    aria-pressed={conjunto?.id === c.id}
                    className={clsx(
                      "rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40",
                      conjunto?.id === c.id ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-slate-200 hover:border-slate-300",
                    )}
                  >
                    <span className="block text-2xl font-semibold text-slate-900">{c.itens.length}</span>
                    <span className="block text-sm font-medium text-slate-800">{c.rotulo}</span>
                    <span className="block truncate text-xs text-slate-500" title={c.descricao}>
                      {c.descricao}
                    </span>
                  </button>
                ))}
              </div>
            </Secao>

            <Secao icone={Download} titulo="Formato">
              <div className="grid gap-2 sm:grid-cols-2">
                {FORMATOS.map((f) => {
                  const Icone = ICONES[f.id] ?? FileText;
                  const ativo = f.id === formato.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => set("formato", f.id)}
                      aria-pressed={ativo}
                      className={clsx("flex items-start gap-3 rounded-xl border p-3 text-left transition", ativo ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-slate-200 hover:border-slate-300")}
                    >
                      <Icone className={clsx("mt-0.5 h-5 w-5 shrink-0", ativo ? "text-brand-600" : "text-slate-400")} />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">
                          {f.rotulo} <span className="font-normal text-slate-400">.{f.entrega === "imprimir" ? "pdf" : f.extensao}</span>
                        </span>
                        <span className="block text-xs text-slate-500">{f.descricao}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Secao>

            <Secao
              icone={Columns3}
              titulo={`Colunas (${prefs.colunas.length}/${COLUNAS.length})`}
              extra={
                <div className="flex gap-1">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => set("colunas", p.colunas)}
                      className={clsx("rounded-full px-2.5 py-1 text-xs font-medium transition", presetAtivo === p.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
                    >
                      {p.rotulo}
                    </button>
                  ))}
                </div>
              }
            >
              <ul className="scroll-fino max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                {colunasOrdenadas.map((c) => {
                  const pos = prefs.colunas.indexOf(c.id);
                  const marcada = pos >= 0;
                  return (
                    <li key={c.id} className={clsx("flex items-center gap-3 px-3 py-2", !marcada && "bg-slate-50/60")}>
                      <input type="checkbox" checked={marcada} onChange={() => alternarColuna(c.id)} id={`col-${c.id}`} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
                      <label htmlFor={`col-${c.id}`} className={clsx("flex-1 cursor-pointer text-sm", marcada ? "text-slate-800" : "text-slate-400")}>
                        {marcada && <span className="mr-2 inline-block w-4 text-right font-mono text-[11px] text-slate-400">{pos + 1}</span>}
                        {c.rotulo}
                      </label>
                      {marcada && (
                        <span className="flex gap-0.5">
                          <button type="button" onClick={() => mover(c.id, -1)} disabled={pos === 0} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" aria-label={`Mover ${c.rotulo} para cima`}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => mover(c.id, 1)}
                            disabled={pos === prefs.colunas.length - 1}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                            aria-label={`Mover ${c.rotulo} para baixo`}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Secao>

            <Secao icone={Settings2} titulo="Opções">
              <div className="space-y-4 rounded-xl border border-slate-200 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-slate-700">
                    Formato das datas
                    <select
                      value={prefs.formatacao.formatoData}
                      onChange={(e) => set("formatacao", { ...prefs.formatacao, formatoData: e.target.value as "br" | "iso" })}
                      className="mt-1 block w-full rounded-lg border-0 py-1.5 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600"
                    >
                      <option value="br">31/12/2026 (brasileiro)</option>
                      <option value="iso">2026-12-31 (ISO)</option>
                    </select>
                  </label>
                  {formato.opcoes.includes("separador") && (
                    <label className="text-sm text-slate-700">
                      Separador do CSV
                      <select
                        value={prefs.separadorCsv}
                        onChange={(e) => set("separadorCsv", e.target.value as Preferencias["separadorCsv"])}
                        className="mt-1 block w-full rounded-lg border-0 py-1.5 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600"
                      >
                        <option value=";">Ponto e vírgula (Excel em português)</option>
                        <option value=",">Vírgula (padrão internacional)</option>
                        <option value={"\t"}>Tabulação</option>
                      </select>
                    </label>
                  )}
                </div>
                <Alternador
                  checked={prefs.formatacao.textoCompleto}
                  onChange={(v) => set("formatacao", { ...prefs.formatacao, textoCompleto: v })}
                  rotulo="Inteiro teor completo"
                  dica={`Desligado, o texto é resumido em ${prefs.formatacao.limiteTexto} caracteres.`}
                />
                {formato.opcoes.includes("cabecalho") && <Alternador checked={prefs.incluirCabecalho} onChange={(v) => set("incluirCabecalho", v)} rotulo="Incluir linha de cabeçalho" />}
                {formato.opcoes.includes("bom") && (
                  <Alternador checked={prefs.bomUtf8} onChange={(v) => set("bomUtf8", v)} rotulo="Compatibilidade com Excel (BOM UTF-8)" dica="Garante acentos corretos ao abrir o CSV no Excel." />
                )}
                {formato.entrega === "download" && (
                  <label className="block text-sm text-slate-700">
                    Nome do arquivo
                    <span className="mt-1 flex rounded-lg ring-1 ring-inset ring-slate-300 focus-within:ring-2 focus-within:ring-brand-600">
                      <input value={nome} onChange={(e) => setNome(e.target.value)} className="min-w-0 flex-1 rounded-l-lg border-0 bg-transparent py-1.5 text-sm focus:ring-0" />
                      <span className="flex items-center rounded-r-lg bg-slate-50 px-3 text-sm text-slate-500">.{formato.extensao}</span>
                    </span>
                  </label>
                )}
              </div>
            </Secao>
          </div>

          {/* Pré-visualização */}
          <div className="flex min-h-0 flex-col bg-slate-50 p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pré-visualização</h3>
              <span className="text-xs text-slate-400">primeiras {Math.min(5, conjunto?.itens.length ?? 0)} de {conjunto?.itens.length ?? 0} linhas</span>
            </div>
            <div className="scroll-fino min-h-[180px] flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
              {prefs.colunas.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-400">Selecione ao menos uma coluna.</p>
              ) : (
                <table className="min-w-full text-xs">
                  {prefs.incluirCabecalho && (
                    <thead className="sticky top-0">
                      <tr>
                        {previa.cabecalho.map((c) => (
                          <th key={c} className="whitespace-nowrap bg-slate-900 px-3 py-2 text-left font-semibold text-white">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {previa.linhas.map((l, i) => (
                      <tr key={i} className="odd:bg-white even:bg-slate-50">
                        {l.map((v, j) => (
                          <td key={j} className="max-w-[220px] truncate whitespace-nowrap border-b border-slate-100 px-3 py-1.5 text-slate-700" title={v}>
                            {v || <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                ["Linhas", tabela.linhas.length],
                ["Colunas", prefs.colunas.length],
                ["Formato", formato.rotulo],
              ].map(([r, v]) => (
                <div key={r} className="rounded-lg bg-white px-2 py-2 ring-1 ring-slate-200">
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">{r}</dt>
                  <dd className="truncate text-sm font-semibold text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>
            <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
              Lembrar estas escolhas na próxima exportação
            </label>
          </div>
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" icon={copiado ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />} onClick={copiar} disabled={!podeExportar}>
            {copiado ? "Copiado" : "Copiar como tabela"}
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onFechar}>
              Cancelar
            </Button>
            <Button onClick={exportar} disabled={!podeExportar} icon={formato.entrega === "imprimir" ? <Printer className="h-4 w-4" /> : <Download className="h-4 w-4" />}>
              {formato.entrega === "imprimir" ? "Gerar relatório" : `Exportar ${tabela.linhas.length} em ${formato.rotulo}`}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
