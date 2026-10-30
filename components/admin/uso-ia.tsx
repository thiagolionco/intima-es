"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, Card, CardHeader, EmptyState, Input, Spinner } from "@/components/ui";
import { api, ErroApi } from "@/lib/auth/api";

interface PorFuncao {
  funcao: string;
  modelo: string;
  chamadas: number;
  entrada: number;
  saida: number;
  cacheEscrita: number;
  cacheLeitura: number;
  buscasWeb: number;
  custoUsd: number | null;
}

interface DoEscritorio {
  escritorioId: string;
  escritorio: string;
  chamadas: number;
  custoUsd: number;
  semPreco: boolean;
  porFuncao: PorFuncao[];
}

interface Relatorio {
  mes: string;
  custoUsd: number;
  chamadas: number;
  escritorios: DoEscritorio[];
}

/** Câmbio só para dar ideia em reais; o custo real vem em dólar na fatura da Anthropic. */
const CAMBIO = 5.5;

const FUNCOES: Record<string, string> = {
  resumo: "Resumo de intimação",
  analise_risco: "Análise de risco",
  parecer: "Rascunho de parecer",
  editor: "Editor do parecer",
  assistente: "Assistente do caso",
  "linha-do-tempo": "Linha do tempo",
  citacoes: "Verificação de citações",
  providencias: "Providências",
  notas: "Anotações",
  revisoes: "Revisão em tabela",
  pesquisa: "Pesquisa",
  pedidos: "Pedidos",
  monitor: "Monitor de precedentes",
  monitores: "Monitor de precedentes",
  alertas: "Alertas de precedentes",
  "fluxos-ia": "Fluxos de IA",
  biblioteca: "Biblioteca",
};

const usd = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 });
const brl = (n: number) => (n * CAMBIO).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mil = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : n >= 1000 ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(n));

function mesAtual() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/** Uso da IA de todos os escritórios no mês, com o custo estimado pela tabela de preços. */
export function UsoIaAdmin() {
  const [mes, setMes] = useState(mesAtual);
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setRel(null);
    api<Relatorio>(`/api/admin/uso-ia?mes=${encodeURIComponent(mes)}`)
      .then((r) => {
        if (!vivo) return;
        setRel(r);
        setErro("");
      })
      .catch((e) => vivo && setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar o uso da IA."));
    return () => {
      vivo = false;
    };
  }, [mes]);

  return (
    <Card className="mt-6">
      <CardHeader
        title="Uso da IA"
        subtitle={rel ? `${rel.chamadas} chamada(s) · ${usd(rel.custoUsd)} (cerca de ${brl(rel.custoUsd)}) · custo estimado pela tabela de preços da Anthropic` : "Tokens gastos por escritório e o custo estimado"}
        action={<Input type="month" aria-label="Mês" value={mes} max={mesAtual()} onChange={(e) => e.target.value && setMes(e.target.value)} className="w-auto" />}
      />
      {erro ? (
        <div className="p-5">
          <Alert title="Erro">{erro}</Alert>
        </div>
      ) : !rel ? (
        <div className="p-6">
          <Spinner />
        </div>
      ) : !rel.escritorios.length ? (
        <EmptyState icon={<Sparkles className="h-5 w-5" />} title="Nenhum uso de IA neste mês" description="As chamadas passam a aparecer aqui assim que alguém usar uma função de IA." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {rel.escritorios.map((e) => (
            <li key={e.escritorioId}>
              <button type="button" className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50" aria-expanded={aberto === e.escritorioId} onClick={() => setAberto(aberto === e.escritorioId ? null : e.escritorioId)}>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{e.escritorio}</span>
                <span className="shrink-0 text-xs text-slate-500">{e.chamadas} chamada(s)</span>
                <span className="w-28 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
                  {usd(e.custoUsd)}
                  {e.semPreco ? "*" : ""}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${aberto === e.escritorioId ? "rotate-180" : ""}`} aria-hidden />
              </button>
              {aberto === e.escritorioId && (
                <div className="overflow-x-auto px-5 pb-4">
                  <table className="w-full min-w-[560px] text-xs">
                    <thead className="text-left text-slate-500">
                      <tr>
                        <th className="py-1.5 font-medium">Função</th>
                        <th className="py-1.5 font-medium">Modelo</th>
                        <th className="py-1.5 text-right font-medium">Chamadas</th>
                        <th className="py-1.5 text-right font-medium">Entrada</th>
                        <th className="py-1.5 text-right font-medium">Do cache</th>
                        <th className="py-1.5 text-right font-medium">Saída</th>
                        <th className="py-1.5 text-right font-medium">Buscas</th>
                        <th className="py-1.5 text-right font-medium">Custo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {e.porFuncao.map((f) => (
                        <tr key={`${f.funcao}|${f.modelo}`}>
                          <td className="py-1.5">{FUNCOES[f.funcao] ?? f.funcao}</td>
                          <td className="py-1.5 text-slate-500">{f.modelo.replace(/^claude-/, "")}</td>
                          <td className="py-1.5 text-right tabular-nums">{f.chamadas}</td>
                          <td className="py-1.5 text-right tabular-nums">{mil(f.entrada + f.cacheEscrita)}</td>
                          <td className="py-1.5 text-right tabular-nums">{mil(f.cacheLeitura)}</td>
                          <td className="py-1.5 text-right tabular-nums">{mil(f.saida)}</td>
                          <td className="py-1.5 text-right tabular-nums">{f.buscasWeb}</td>
                          <td className="py-1.5 text-right tabular-nums">{f.custoUsd === null ? "sem preço" : usd(f.custoUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {e.semPreco && <p className="mt-2 text-xs text-slate-500">* Algum modelo usado não está na tabela de preços; o total está abaixo do real.</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
