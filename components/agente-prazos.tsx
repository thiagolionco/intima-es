"use client";

import clsx from "clsx";
import { AlertTriangle, Bot, CheckCircle2, Info, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/auth/api";
import { type Gravidade, type PropostaPrazo, SEM_PRAZO } from "@/lib/prazos/agente-prazos";
import { dataBR } from "@/lib/prazos/datas";
import { useStore } from "@/lib/store";
import { rotuloTarefa } from "@/lib/tarefas";
import type { Intimacao } from "@/lib/types";
import { mensagemDe, useApi } from "@/lib/use-api";
import { MemoriaPrazo } from "./prazo";
import { useToast } from "./toast";
import { Alert, Button, Card, CardHeader } from "./ui";

const ESTILO: Record<Gravidade, { classe: string; icone: typeof Info }> = {
  grave: { classe: "text-red-700", icone: AlertTriangle },
  atencao: { classe: "text-amber-700", icone: AlertTriangle },
  info: { classe: "text-slate-500", icone: Info },
};

const nomeDoLeitor = (p: PropostaPrazo) =>
  p.leitor === "regras" ? "regras simples do Clepsa (sem IA)" : `${p.tentativas === 2 ? "IA, com releitura pelo modelo maior" : "IA"} (${p.modelos.join(" → ")})`;

/**
 * Agente de Prazos (piloto) na ficha da intimação. A IA lê, o Clepsa calcula e confere, e só o
 * advogado grava: nada é salvo até ele clicar em "Usar este prazo".
 */
export function CartaoAgentePrazos({ i }: { i: Intimacao }) {
  const { atualizarIntimacao } = useStore();
  const { toast } = useToast();
  const { dados: estado } = useApi<{ disponivel: boolean }>("/api/agente-prazos");
  const [proposta, setProposta] = useState<PropostaPrazo>();
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string>();
  const comIa = estado?.disponivel ?? false;

  const pedir = async (semIa: boolean) => {
    setCarregando(true);
    setErro(undefined);
    try {
      setProposta(await api<PropostaPrazo>("/api/agente-prazos", { body: { intimacaoId: i.id, semIa } }));
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setCarregando(false);
    }
  };

  const usar = () => {
    const regra = proposta?.conferencia.regra;
    if (!regra) return;
    atualizarIntimacao(i.id, { regraPrazo: regra });
    toast(`Prazo confirmado: vence em ${dataBR(proposta!.conferencia.calculo!.fim)}`);
    setProposta(undefined);
  };

  const l = proposta?.leitura;
  const c = proposta?.conferencia;
  const mesmoPrazo = !!c?.calculo && i.prazo === c.calculo.fim;

  return (
    <Card>
      <CardHeader
        title="Agente de Prazos"
        subtitle="Piloto: lê a publicação, propõe o prazo e confere a contagem"
        action={<span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">piloto</span>}
      />
      <div className="space-y-3 p-5 text-sm">
        {!proposta && (
          <>
            <p className="text-slate-600">
              {comIa ? "A IA lê a publicação; o Clepsa conta os dias com o calendário do tribunal e confere a leitura." : "A IA não está ligada neste servidor: a proposta sai pelas regras simples do Clepsa."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" ia={comIa} loading={carregando} icon={<Bot className="h-4 w-4" aria-hidden />} onClick={() => void pedir(!comIa)}>
                {comIa ? "Propor prazo com a IA" : "Propor prazo"}
              </Button>
              {comIa && (
                <Button size="sm" variant="ghost" disabled={carregando} onClick={() => void pedir(true)}>
                  Só pelas regras (grátis)
                </Button>
              )}
            </div>
          </>
        )}
        {erro && <Alert>{erro}</Alert>}

        {proposta && l && c && (
          <>
            <div className={clsx("flex items-start gap-2 rounded-lg px-3 py-2 ring-1 ring-inset", c.situacao === "confere" ? "bg-emerald-50 text-emerald-800 ring-emerald-600/20" : "bg-red-50 text-red-800 ring-red-600/20")}>
              {c.situacao === "confere" ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
              <p>{c.situacao === "confere" ? "O conferente não achou problema grave. Mesmo assim, leia antes de confirmar." : "O conferente achou problema. Leia o inteiro teor e corrija antes de usar."}</p>
            </div>

            <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
              <dt className="text-slate-500">Tarefa</dt>
              <dd className="font-medium text-slate-900">{rotuloTarefa(l.tarefa)}</dd>
              <dt className="text-slate-500">Prazo</dt>
              <dd className="text-slate-900">
                {l.dias ? `${l.dias} dias ${l.contagem === "uteis" ? "úteis" : "corridos"}${l.dobro ? ", em dobro" : ""}` : SEM_PRAZO.includes(l.tarefa) ? "não abre prazo" : "não definido"}
                {l.fundamento && <span className="text-slate-500"> · {l.fundamento}</span>}
              </dd>
              {l.dataAudiencia && (
                <>
                  <dt className="text-slate-500">Audiência</dt>
                  <dd className="text-violet-700">
                    {dataBR(l.dataAudiencia)}
                    {l.horaAudiencia && ` às ${l.horaAudiencia}`}
                  </dd>
                </>
              )}
            </dl>
            {l.trecho && <p className="text-xs text-slate-500">Base no texto: “{l.trecho}”</p>}
            {l.observacao && <p className="text-xs text-slate-500">{l.observacao}</p>}

            {c.calculo && c.regra && <MemoriaPrazo r={c.calculo} regra={c.regra} />}

            {c.alertas.length > 0 && (
              <ul className="space-y-1.5">
                {c.alertas.map((a) => {
                  const { classe, icone: Icone } = ESTILO[a.gravidade];
                  return (
                    <li key={a.codigo} className={clsx("flex items-start gap-1.5 text-xs", classe)}>
                      <Icone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {a.texto}
                    </li>
                  );
                })}
              </ul>
            )}

            {i.prazo && c.calculo && !mesmoPrazo && <p className="text-xs text-amber-700">Esta intimação já tem prazo em {dataBR(i.prazo)}. Usar a proposta troca o prazo.</p>}

            <div className="flex flex-wrap gap-2">
              {c.regra && c.calculo && !mesmoPrazo && (
                <Button size="sm" variant={c.situacao === "confere" ? "primary" : "secondary"} icon={<CheckCircle2 className="h-4 w-4" aria-hidden />} onClick={usar}>
                  Usar este prazo
                </Button>
              )}
              {mesmoPrazo && <p className="text-xs text-emerald-700">O prazo já gravado é igual ao proposto.</p>}
              <Button size="sm" variant="ghost" onClick={() => setProposta(undefined)}>
                Descartar
              </Button>
            </div>
            <p className="text-xs text-slate-400">Leitura: {nomeDoLeitor(proposta)}. Nada é protocolado nem enviado: só grava o prazo se você confirmar.</p>
          </>
        )}
      </div>
    </Card>
  );
}
