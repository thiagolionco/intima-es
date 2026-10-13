"use client";

import { Activity, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/auth/api";
import { DIAS_MOVIMENTACAO_NOVA, type Movimentacao, type MovimentacoesProcesso } from "@/lib/processos";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "./toast";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Spinner } from "./ui";

/** Consulta de novo ao abrir o processo quando a última passou disto. */
const VALIDADE_MS = 20 * 60 * 60 * 1000;

/**
 * Andamentos do processo no DataJud. Ao abrir o processo, consulta sozinho se nunca consultou ou
 * se a última consulta é de mais de 20 horas.
 */
export function useMovimentacoes(processoId: string) {
  const { toast } = useToast();
  const [dados, setDados] = useState<MovimentacoesProcesso | null>();
  const [disponivel, setDisponivel] = useState(false);
  const [erro, setErro] = useState<string>();
  const [consultando, setConsultando] = useState(false);
  const emAndamento = useRef(false);

  const consultar = useCallback(
    async (silencioso = false) => {
      if (emAndamento.current) return;
      emAndamento.current = true;
      setConsultando(true);
      try {
        const r = await api<{ movimentacoes: MovimentacoesProcesso; novos: number }>(`/api/processos/${processoId}/movimentacoes`, { method: "POST" });
        setDados(r.movimentacoes);
        if (!silencioso) {
          if (r.movimentacoes.erro) toast(r.movimentacoes.erro, { tom: "error" });
          else toast(r.novos ? `${r.novos === 1 ? "1 andamento novo" : `${r.novos} andamentos novos`}` : "Nenhum andamento novo");
        }
      } catch (e) {
        if (!silencioso) toast(e instanceof Error ? e.message : "Não foi possível consultar o DataJud.", { tom: "error" });
      } finally {
        emAndamento.current = false;
        setConsultando(false);
      }
    },
    [processoId, toast],
  );

  useEffect(() => {
    let vivo = true;
    api<{ movimentacoes: MovimentacoesProcesso | null; disponivel: boolean }>(`/api/processos/${processoId}/movimentacoes`)
      .then((r) => {
        if (!vivo) return;
        setDados(r.movimentacoes);
        setDisponivel(r.disponivel);
        setErro(undefined);
        const velha = !r.movimentacoes || Date.now() - Date.parse(r.movimentacoes.consultadoEm) > VALIDADE_MS;
        if (r.disponivel && velha) void consultar(true);
      })
      .catch((e) => vivo && setErro(e instanceof Error ? e.message : "Não foi possível carregar os andamentos."));
    return () => {
      vivo = false;
    };
  }, [processoId, consultar]);

  return { dados, disponivel, erro, consultando, consultar: () => consultar(false) };
}

type Estado = ReturnType<typeof useMovimentacoes>;

const FUSO = { timeZone: "America/Sao_Paulo" } as const;
const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", FUSO);
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { ...FUSO, hour: "2-digit", minute: "2-digit" });

const ehNova = (m: Movimentacao) => Date.now() - Date.parse(m.dataHora) < DIAS_MOVIMENTACAO_NOVA * 24 * 60 * 60 * 1000;

const AVISO = "Andamentos informados pelos tribunais ao DataJud, do CNJ. Costumam chegar com alguns dias de atraso: confira no site do tribunal antes de contar prazo.";

function Linha({ m }: { m: Movimentacao }) {
  return (
    <li className="flex gap-4 px-5 py-3">
      <div className="w-24 shrink-0 pt-0.5 text-xs text-slate-500">
        <p className="font-medium text-slate-700">{dia(m.dataHora)}</p>
        <p>{hora(m.dataHora)}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">
          {m.nome}
          {ehNova(m) && <Badge className="ml-2 bg-brand-50 text-brand-700">Novo</Badge>}
        </p>
        {m.complementos?.length ? <p className="mt-0.5 text-xs text-slate-600">{m.complementos.join(" · ")}</p> : null}
        {(m.grau || m.orgao) && <p className="mt-0.5 text-xs text-slate-400">{[m.grau, m.orgao].filter(Boolean).join(" · ")}</p>}
      </div>
    </li>
  );
}

/** Último andamento, para a aba Resumo. */
export function CartaoMovimentacao({ estado, onVer }: { estado: Estado; onVer: () => void }) {
  const { dados, disponivel, consultando } = estado;
  if (!disponivel && !dados) return null;
  const ultima = dados?.movimentos[0];
  return (
    <Card>
      <CardHeader
        title="Último andamento"
        subtitle={dados ? `DataJud, ${formatDateTime(dados.consultadoEm)}` : "DataJud"}
        action={
          dados?.movimentos.length ? (
            <Button size="sm" variant="ghost" className="whitespace-nowrap" onClick={onVer}>
              Ver todos
            </Button>
          ) : undefined
        }
      />
      {ultima ? (
        <ul>
          <Linha m={ultima} />
        </ul>
      ) : (
        <p className="px-5 py-4 text-sm text-slate-500">
          {consultando || dados === undefined ? "Consultando o DataJud…" : dados?.encontrado === false ? "O DataJud ainda não tem este processo." : "Nenhum andamento no DataJud."}
        </p>
      )}
    </Card>
  );
}

/** Aba Andamentos da tela do processo. */
export function MovimentacoesDoProcesso({ estado }: { estado: Estado }) {
  const { dados, disponivel, erro, consultando, consultar } = estado;
  const botao = disponivel && (
    <Button size="sm" variant="secondary" className="whitespace-nowrap" icon={<RefreshCw className="h-4 w-4" />} loading={consultando} onClick={() => void consultar()}>
      {consultando ? "Consultando…" : "Consultar agora"}
    </Button>
  );
  const detalhes = dados && [`Consultado em ${formatDateTime(dados.consultadoEm)}`, dados.atualizadoNoTribunal && `tribunal atualizou em ${formatDateTime(dados.atualizadoNoTribunal)}`].filter(Boolean).join(" · ");

  return (
    <Card>
      <CardHeader title="Andamentos" subtitle={AVISO} action={botao || undefined} />
      {erro ? (
        <div className="p-5">
          <Alert>{erro}</Alert>
        </div>
      ) : dados === undefined || (consultando && !dados) ? (
        <Spinner label="Consultando o DataJud…" />
      ) : (
        <>
          {dados?.erro && (
            <div className="px-5 pt-5">
              <Alert tone="warning">
                A última consulta falhou: {dados.erro}
                {dados.movimentos.length ? " Abaixo estão os andamentos da consulta anterior." : ""}
              </Alert>
            </div>
          )}
          {dados?.movimentos.length ? (
            <>
              <p className="px-5 pt-4 text-xs text-slate-500">{detalhes}</p>
              <ul className="divide-y divide-slate-100">
                {dados.movimentos.map((m, i) => (
                  <Linha key={`${m.dataHora}-${i}`} m={m} />
                ))}
              </ul>
            </>
          ) : (
            <EmptyState
              icon={<Activity className="h-6 w-6" />}
              title={!disponivel && !dados ? "Consulta ao DataJud desligada" : dados?.encontrado === false ? "Processo ainda não está no DataJud" : "Nenhum andamento"}
              description={
                dados?.encontrado === false
                  ? "Os tribunais enviam os processos ao CNJ com atraso, e processos em segredo de justiça não aparecem. O Clepsa consulta de novo todo dia."
                  : detalhes || "Os andamentos aparecem aqui depois da primeira consulta."
              }
            />
          )}
        </>
      )}
    </Card>
  );
}
