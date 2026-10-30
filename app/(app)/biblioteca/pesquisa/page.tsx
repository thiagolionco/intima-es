"use client";

import { ExternalLink, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { AbasBiblioteca } from "@/components/abas-rota";
import { GuardarNaBiblioteca } from "@/components/guardar-na-biblioteca";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, PageHeader, Textarea } from "@/components/ui";
import { api } from "@/lib/auth/api";
import type { ResultadoPesquisa } from "@/lib/pesquisa";
import { mensagemDe, useApi } from "@/lib/use-api";
import { IaPensando } from "@/components/ia/ia-pensando";

const TIPO = { legislacao: "Legislação", sumula: "Súmula", jurisprudencia: "Jurisprudência" } as const;

export default function PesquisaPage() {
  const { dados } = useApi<{ disponivel: boolean }>("/api/pesquisa");
  const [pergunta, setPergunta] = useState("");
  const [pesquisando, setPesquisando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [resultado, setResultado] = useState<ResultadoPesquisa>();

  async function pesquisar() {
    setPesquisando(true);
    setErro(undefined);
    try {
      setResultado((await api<{ resultado: ResultadoPesquisa }>("/api/pesquisa", { body: { pergunta } })).resultado);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setPesquisando(false);
    }
  }

  return (
    <>
      <PageHeader title="Biblioteca" description="Pergunte em linguagem comum. A IA pesquisa só nas fontes oficiais (Planalto, STF, STJ, TST e tribunais) e mostra o link de cada fonte para você conferir." />
      <AbasBiblioteca atual="pesquisa" />

      {dados && !dados.disponivel ? (
        <Alert tone="info" title="Pesquisa pela IA desligada neste servidor">
          Para ligar, configure a chave ANTHROPIC_API_KEY. Enquanto isso, use os atalhos de pesquisa externa na aba Itens guardados.
        </Alert>
      ) : (
        <>
          <Card className="mb-6">
            <div className="space-y-3 p-5">
              <label htmlFor="pergunta-pesquisa" className="block text-sm font-medium text-slate-700">
                O que você quer saber?
              </label>
              <Textarea
                id="pergunta-pesquisa"
                rows={3}
                maxLength={2000}
                value={pergunta}
                onChange={(e) => setPergunta(e.target.value)}
                placeholder="Ex.: Cabe dano moral por negativação quando já havia outra inscrição legítima? Qual o entendimento atual do STJ?"
              />
              <div className="flex justify-end">
                <Button icon={<Search className="h-4 w-4" />} ia loading={pesquisando} disabled={!pergunta.trim()} onClick={() => void pesquisar()}>
                  {pesquisando ? "Pesquisando…" : "Pesquisar"}
                </Button>
              </div>
            </div>
          </Card>

          {erro && <Alert>{erro}</Alert>}
          {pesquisando ? (
            <IaPensando label="A IA está pesquisando nas fontes oficiais. Pode levar um ou dois minutos…" />
          ) : resultado ? (
            <div className="space-y-6">
              <Card>
                <CardHeader title="Resposta" subtitle={`${resultado.paginasConsultadas} página(s) oficial(is) consultada(s). Confira cada fonte antes de usar.`} />
                <p className="whitespace-pre-wrap p-5 text-sm leading-relaxed text-slate-800">{resultado.resposta}</p>
              </Card>
              <Card>
                <CardHeader title="Fontes" subtitle="Só entram fontes com link oficial." />
                {resultado.fontes.length ? (
                  <ul className="divide-y divide-slate-100">
                    {resultado.fontes.map((f) => (
                      <li key={f.url} className="space-y-1.5 px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-brand-50 text-brand-700">{TIPO[f.tipo]}</Badge>
                          <span className="text-sm font-medium text-slate-900">{f.referencia}</span>
                          {f.tribunal && <span className="text-xs text-slate-500">{f.tribunal}</span>}
                        </div>
                        <p className="text-sm text-slate-700">{f.resumo}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <a href={f.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                            Abrir fonte oficial <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          </a>
                          <GuardarNaBiblioteca item={{ tipo: f.tipo, titulo: f.referencia, referencia: f.referencia, tribunal: f.tribunal, texto: f.resumo, link: f.url }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-4 text-sm text-slate-500">A IA não achou fonte oficial que pudesse linkar. Tente perguntar de outro jeito.</p>
                )}
              </Card>
            </div>
          ) : (
            <Card>
              <EmptyState icon={<Sparkles className="h-6 w-6" />} title="Faça a primeira pergunta" description="O que for útil, guarde na biblioteca: a IA passa a usar no rascunho do parecer e na verificação de citações." />
            </Card>
          )}
        </>
      )}
    </>
  );
}
