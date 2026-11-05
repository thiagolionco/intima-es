"use client";

import { CheckSquare, ExternalLink, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { AbasNews } from "@/components/abas-rota";
import { PesquisaExterna } from "@/components/biblioteca";
import { Badge, Card, CardHeader, Input, PageHeader } from "@/components/ui";
import { FONTES_PESQUISA_OFICIAIS } from "@/lib/biblioteca";
import { ALERTAS_FORMAIS, EIXOS, HIERARQUIA, ROTINA } from "@/lib/news/fontes";

export default function GuiaCuradoriaPage() {
  const [busca, setBusca] = useState("");
  return (
    <>
      <PageHeader
        title="News"
        description="Protocolo de curadoria e checagem para atualização jurisprudencial, precedentes vinculantes e controle de constitucionalidade. Só fontes oficiais e primárias."
      />
      <AbasNews atual="guia" />

      <nav aria-label="Seções do guia" className="mb-6 flex flex-wrap gap-2 text-sm">
        {[["hierarquia", "Hierarquia"], ...EIXOS.map((e) => [e.id, `${e.numero}. ${e.titulo.split(" (")[0]}`]), ["rotina", "Rotina de monitoramento"]].map(([id, rotulo]) => (
          <a key={id} href={`#${id}`} className="rounded-full bg-white px-3 py-1 text-slate-600 ring-1 ring-inset ring-slate-200 hover:text-brand-700">
            {rotulo}
          </a>
        ))}
      </nav>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Pesquisar agora nas bases oficiais" subtitle="Os mesmos atalhos da Biblioteca, sem agregadores." />
          <div className="space-y-3 p-5">
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: Tema 1.046, dano moral negativação, ADI 5766" aria-label="O que pesquisar" />
            <PesquisaExterna busca={busca} fontes={FONTES_PESQUISA_OFICIAIS} />
          </div>
        </Card>

        <section id="hierarquia" className="scroll-mt-6">
          <Card>
            <CardHeader title="Hierarquia de confiabilidade" subtitle="De cima para baixo. Só os níveis 1 e 2 fundamentam sozinhos." />
            <ol className="divide-y divide-slate-100">
              {HIERARQUIA.map((h) => (
                <li key={h.nivel} className="flex gap-4 px-5 py-3">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${h.nivel <= 2 ? "bg-brand-600 text-white" : h.nivel === 5 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"}`}>{h.nivel}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{h.titulo}</p>
                    <p className="text-sm text-slate-600">{h.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </section>

        {EIXOS.map((e) => (
          <section key={e.id} id={e.id} className="scroll-mt-6">
            <Card>
              <CardHeader title={`${e.numero}. ${e.titulo}`} subtitle={e.objetivo} />
              <div className="divide-y divide-slate-100">
                {e.fontes.map((f) => (
                  <div key={f.url} className="space-y-2 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={f.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                        {f.nome} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                      {!f.conferido && (
                        <span title="O site oficial recusou a conferência automática do link: abra e confira à mão.">
                          <Badge className="bg-amber-50 text-amber-800">conferir à mão</Badge>
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700">{f.serve}</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                      {f.como.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div className="bg-slate-50 px-5 py-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <ShieldAlert className="h-4 w-4 text-brand-600" aria-hidden /> Checagem antes de usar na peça
                  </p>
                  <ul className="space-y-1 text-sm text-slate-700">
                    {e.checagem.map((c) => (
                      <li key={c} className="flex gap-2">
                        <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          </section>
        ))}

        <section id="rotina" className="scroll-mt-6">
          <Card>
            <CardHeader title="Rotina de monitoramento contínuo" subtitle="A aba News cobre os feeds; o resto é checagem manual com hora marcada." />
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2">
              {ROTINA.map((r) => (
                <div key={r.quando} className="bg-white px-5 py-4">
                  <p className="mb-2 text-sm font-semibold text-slate-900">{r.quando}</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                    {r.itens.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 px-5 py-4 text-sm text-slate-600">
              <p className="mb-2 font-medium text-slate-800">Alertas formais para assinar no seu leitor de RSS ou e-mail</p>
              <ul className="space-y-1">
                {ALERTAS_FORMAIS.map((a) => (
                  <li key={a.url}>
                    <a href={a.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                      {a.nome} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </section>
      </div>
    </>
  );
}
