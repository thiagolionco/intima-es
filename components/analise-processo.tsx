"use client";

import clsx from "clsx";
import { History, ShieldAlert, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/auth/api";
import { type AnaliseRisco, type DocumentoProcesso, NIVEL_RISCO_LABEL, type NivelRisco, type PontoAnalise } from "@/lib/processos";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "./toast";
import { Alert, Button, Card, CardHeader, EmptyState, Spinner } from "./ui";
import { IaAnimacao, IaPensando } from "@/components/ia/ia-pensando";

const ESTILO_NIVEL: Record<NivelRisco, string> = {
  baixo: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  medio: "bg-amber-50 text-amber-800 ring-amber-200",
  alto: "bg-red-50 text-red-700 ring-red-200",
  indeterminado: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function SeloRisco({ nivel, className }: { nivel: NivelRisco; className?: string }) {
  return <span className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", ESTILO_NIVEL[nivel], className)}>{NIVEL_RISCO_LABEL[nivel]}</span>;
}

/**
 * Análises de risco do processo e o pedido de uma nova. Fica na página do processo para a análise
 * em andamento continuar visível ao trocar de aba.
 */
export function useAnalises(processoId: string) {
  const { toast } = useToast();
  const [analises, setAnalises] = useState<AnaliseRisco[]>();
  const [disponivel, setDisponivel] = useState(false);
  const [erro, setErro] = useState<string>();
  const [analisando, setAnalisando] = useState(false);
  const emAndamento = useRef(false);

  const recarregar = useCallback(async () => {
    try {
      const r = await api<{ analises: AnaliseRisco[]; disponivel: boolean }>(`/api/processos/${processoId}/analises`);
      setAnalises(r.analises);
      setDisponivel(r.disponivel);
      setErro(undefined);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar a análise de risco.");
    }
  }, [processoId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const analisar = useCallback(async () => {
    if (emAndamento.current) return;
    emAndamento.current = true;
    setAnalisando(true);
    try {
      const { analise } = await api<{ analise: AnaliseRisco }>(`/api/processos/${processoId}/analises`, { method: "POST" });
      setAnalises((atual) => [analise, ...(atual ?? [])]);
      toast(`Análise pronta: ${NIVEL_RISCO_LABEL[analise.nivel].toLowerCase()}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível analisar.", { tom: "error" });
    } finally {
      emAndamento.current = false;
      setAnalisando(false);
    }
  }, [processoId, toast]);

  return { analises, disponivel, erro, analisando, analisar, recarregar };
}

type Estado = ReturnType<typeof useAnalises>;

/** PDFs anexados que a última análise não leu. */
export function documentosNovos(analise: AnaliseRisco | undefined, documentos: DocumentoProcesso[] | undefined): number {
  if (!analise || !documentos) return 0;
  const lidos = new Set(analise.documentos.map((d) => d.id));
  return documentos.filter((d) => !lidos.has(d.id)).length;
}

const AVISO = "Análise automática feita pela IA a partir dos PDFs. Não substitui o parecer do advogado: confira cada ponto na página indicada.";

/** Resumo para a aba Resumo da tela do processo. */
export function CartaoRisco({ estado, temDocumentos, onVer }: { estado: Estado; temDocumentos: boolean; onVer: () => void }) {
  const { analises, disponivel, analisando, analisar } = estado;
  const atual = analises?.[0];
  if (!analises || (!disponivel && !atual)) return null;
  return (
    <Card>
      <CardHeader
        title="Risco (IA)"
        subtitle={atual ? formatDateTime(atual.criadoEm) : undefined}
        action={
          atual && (
            <Button size="sm" variant="ghost" onClick={onVer}>
              Ver análise
            </Button>
          )
        }
      />
      <div className="space-y-3 p-5">
        {analisando ? (
          <IaPensando compacto label="A IA está lendo os PDFs…" />
        ) : atual ? (
          <>
            <SeloRisco nivel={atual.nivel} />
            <p className="line-clamp-5 text-sm leading-relaxed text-slate-700">{atual.justificativa}</p>
          </>
        ) : temDocumentos ? (
          <Button size="sm" icon={<Sparkles className="h-4 w-4" />} onClick={() => void analisar()}>
            Analisar risco
          </Button>
        ) : (
          <p className="text-sm text-slate-500">Anexe os PDFs do processo para a IA avaliar o risco.</p>
        )}
      </div>
    </Card>
  );
}

function Pontos({ titulo, icone, pontos, processoId }: { titulo: string; icone: React.ReactNode; pontos: PontoAnalise[]; processoId: string }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
        {icone} {titulo}
      </h3>
      {pontos.length ? (
        <ul className="space-y-2">
          {pontos.map((p, i) => (
            <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700">
              {p.texto}{" "}
              <a
                href={`/api/processos/${processoId}/documentos/${p.documentoId}#page=${p.pagina}`}
                target="_blank"
                rel="noreferrer"
                className="whitespace-nowrap text-xs font-medium text-brand-700 hover:underline"
              >
                {p.documentoNome}, p. {p.pagina}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Nenhum, com base nos documentos lidos.</p>
      )}
    </div>
  );
}

function Analise({ a, processoId }: { a: AnaliseRisco; processoId: string }) {
  return (
    <div className="space-y-5">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{a.justificativa}</p>
      <div className="grid gap-5 md:grid-cols-2">
        <Pontos titulo="Pontos fortes para o cliente" icone={<ThumbsUp className="h-4 w-4 text-emerald-600" aria-hidden />} pontos={a.pontosFortes} processoId={processoId} />
        <Pontos titulo="Pontos fracos para o cliente" icone={<ThumbsDown className="h-4 w-4 text-red-600" aria-hidden />} pontos={a.pontosFracos} processoId={processoId} />
      </div>
      <p className="text-xs text-slate-500">
        Leu {a.documentos.map((d) => d.nome).join(", ")} · pedida por {a.autorNome} em {formatDateTime(a.criadoEm)}
      </p>
    </div>
  );
}

/** Aba Risco da tela do processo. */
export function AnaliseDoProcesso({ processoId, estado, documentos }: { processoId: string; estado: Estado; documentos?: DocumentoProcesso[] }) {
  const { analises, disponivel, erro, analisando, analisar } = estado;
  const [atual, ...anteriores] = analises ?? [];
  const novos = documentosNovos(atual, documentos);
  const temDocumentos = !!documentos?.length;

  const botao = disponivel && temDocumentos && (
    <Button size="sm" variant={atual ? "secondary" : "primary"} icon={<Sparkles className="h-4 w-4" />} ia loading={analisando} onClick={() => void analisar()}>
      {analisando ? "Analisando…" : atual ? "Reanalisar" : "Analisar risco"}
    </Button>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Risco do processo" subtitle={AVISO} action={botao || undefined} />
        {erro ? (
          <div className="p-5">
            <Alert>{erro}</Alert>
          </div>
        ) : !analises ? (
          <Spinner />
        ) : analisando && !atual ? (
          <IaPensando label="A IA está lendo os PDFs. Pode levar alguns minutos…" />
        ) : atual ? (
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <SeloRisco nivel={atual.nivel} className="px-3 py-1 text-sm" />
              {analisando && (
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <IaAnimacao className="-my-1 h-6 w-6" /> Fazendo uma nova análise…
                </span>
              )}
            </div>
            {novos > 0 && !analisando && (
              <Alert tone="info">
                {novos === 1 ? "Há 1 PDF novo" : `Há ${novos} PDFs novos`} desde esta análise.{disponivel ? " Clique em Reanalisar para incluí-los." : ""}
              </Alert>
            )}
            <Analise a={atual} processoId={processoId} />
          </div>
        ) : (
          <EmptyState
            icon={<ShieldAlert className="h-6 w-6" />}
            title={!disponivel ? "Análise pela IA desligada" : temDocumentos ? "Nenhuma análise ainda" : "Anexe os PDFs primeiro"}
            description={
              !disponivel
                ? "Este servidor não tem a chave da Anthropic configurada (ANTHROPIC_API_KEY)."
                : temDocumentos
                  ? "A IA lê os PDFs do processo e aponta o nível de risco para o cliente, com os pontos fortes e fracos e a página de cada um."
                  : "Na aba Documentos, anexe a inicial, a contestação ou outras peças. A análise começa sozinha depois do envio."
            }
          />
        )}
      </Card>

      {anteriores.length > 0 && (
        <Card>
          <CardHeader title="Análises anteriores" subtitle="Ficam guardadas para comparar como o risco mudou." />
          <ul className="divide-y divide-slate-100">
            {anteriores.map((a) => (
              <li key={a.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 text-sm text-slate-700 hover:bg-slate-50">
                    <History className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <SeloRisco nivel={a.nivel} />
                    <span className="min-w-0 flex-1 truncate">{formatDateTime(a.criadoEm)}</span>
                    <span className="text-xs text-slate-400 group-open:hidden">Ver</span>
                  </summary>
                  <div className="px-5 pb-5">
                    <Analise a={a} processoId={processoId} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
