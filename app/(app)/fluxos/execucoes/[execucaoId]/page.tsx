"use client";

import clsx from "clsx";
import { AlertTriangle, ArrowLeft, CheckCircle2, Circle, Copy, ExternalLink, FileText, Pause, Play, RotateCcw, Save, SkipForward, Table2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BotaoWord } from "@/components/editor-ia";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, CardHeader, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/auth/api";
import { descreverPasso, type ExecucaoFluxo, FERRAMENTA_FLUXO_LABEL, passoAtual, type ResultadoPasso } from "@/lib/fluxos-ia";
import type { ParecerProcesso } from "@/lib/processos";
import { mensagemDe, useApi } from "@/lib/use-api";
import { formatDateTime } from "@/lib/utils";
import { IaAnimacao } from "@/components/ia/ia-pensando";

function IconeEstado({ r, ativo }: { r: ResultadoPasso; ativo: boolean }) {
  if (r.estado === "feito") return <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Feito" />;
  if (r.estado === "erro") return <AlertTriangle className="h-5 w-5 text-red-600" aria-label="Erro" />;
  if (r.estado === "pulado") return <SkipForward className="h-5 w-5 text-slate-400" aria-label="Pulado" />;
  if (ativo) return <span role="img" aria-label="Rodando"><IaAnimacao className="-m-1.5 h-8 w-8" /></span>;
  return <Circle className="h-5 w-5 text-slate-300" aria-label="Na fila" />;
}

/** Salva o relatório como nova versão do parecer do processo. */
function SalvarComoParecer({ processoId, texto }: { processoId: string; texto: string }) {
  const { toast } = useToast();
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  if (salvo) {
    return (
      <Link href={`/processos/${processoId}?aba=parecer`}>
        <Button size="sm" variant="secondary" icon={<ExternalLink className="h-4 w-4" />}>
          Abrir o parecer
        </Button>
      </Link>
    );
  }
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={<Save className="h-4 w-4" />}
      loading={salvando}
      onClick={async () => {
        setSalvando(true);
        try {
          const { pareceres } = await api<{ pareceres: ParecerProcesso[] }>(`/api/processos/${processoId}/pareceres`);
          const baseVersao = pareceres.reduce((m, p) => Math.max(m, p.versao), 0);
          await api(`/api/processos/${processoId}/pareceres`, { body: { texto, baseVersao } });
          setSalvo(true);
          toast(`Salvo como versão ${baseVersao + 1} do parecer`);
        } catch (e) {
          toast(mensagemDe(e), { tom: "error" });
        } finally {
          setSalvando(false);
        }
      }}
    >
      Salvar como parecer
    </Button>
  );
}

export default function ExecucaoFluxoPage() {
  const { execucaoId } = useParams<{ execucaoId: string }>();
  const { toast } = useToast();
  const { dados, erro } = useApi<{ execucao: ExecucaoFluxo }>(`/api/fluxos-ia/execucoes/${execucaoId}`);
  const [exec, setExec] = useState<ExecucaoFluxo>();
  const [rodando, setRodando] = useState(false);
  const [falha, setFalha] = useState<string>();
  const montada = useRef(true);
  const parar = useRef(false);
  const iniciou = useRef(false);

  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
    };
  }, []);

  /** Pede ao servidor a próxima parte até terminar, dar erro ou a pessoa pausar. */
  const tocar = useCallback(
    async (primeiro?: { pular?: boolean }) => {
      parar.current = false;
      setRodando(true);
      setFalha(undefined);
      let corpo: { pular?: boolean } = primeiro ?? {};
      try {
        for (;;) {
          const r = await api<{ execucao: ExecucaoFluxo }>(`/api/fluxos-ia/execucoes/${execucaoId}/avancar`, { body: corpo });
          corpo = {};
          if (!montada.current) return;
          setExec(r.execucao);
          const atual = passoAtual(r.execucao);
          if (r.execucao.estado === "concluida" || !atual || atual.estado === "erro" || parar.current) break;
        }
      } catch (e) {
        if (montada.current) setFalha(mensagemDe(e));
      } finally {
        if (montada.current) setRodando(false);
      }
    },
    [execucaoId],
  );

  // Ao abrir uma execução que ainda roda (e não parou num erro), continua de onde estava.
  useEffect(() => {
    if (!dados || iniciou.current) return;
    iniciou.current = true;
    setExec(dados.execucao);
    const atual = passoAtual(dados.execucao);
    if (dados.execucao.estado === "rodando" && atual && atual.estado !== "erro") void tocar();
  }, [dados, tocar]);

  if (erro) return <Alert>{erro}</Alert>;
  if (!exec) return <Spinner />;

  const atual = passoAtual(exec);
  const feitos = exec.resultados.filter((r) => r.estado === "feito" || r.estado === "pulado").length;
  const umProcesso = exec.processos.length === 1 ? exec.processos[0] : undefined;

  return (
    <>
      <Link href="/fluxos" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Fluxos de IA
      </Link>
      <PageHeader
        title={exec.fluxoTitulo}
        description={
          <>
            {formatDateTime(exec.criadoEm)}
            {exec.processos.length > 0 && (
              <>
                {" · "}
                {umProcesso ? (
                  <Link href={`/processos/${umProcesso.id}`} className="text-brand-700 hover:underline">
                    {umProcesso.rotulo}
                  </Link>
                ) : (
                  `${exec.processos.length} processos`
                )}
              </>
            )}
          </>
        }
        actions={
          exec.estado === "rodando" && atual?.estado !== "erro" ? (
            rodando ? (
              <Button variant="secondary" icon={<Pause className="h-4 w-4" />} onClick={() => (parar.current = true)}>
                Pausar
              </Button>
            ) : (
              <Button icon={<Play className="h-4 w-4" />} onClick={() => void tocar()}>
                Continuar
              </Button>
            )
          ) : undefined
        }
      />

      {exec.estado === "rodando" && (
        <p className="mb-4 text-sm text-slate-500">
          {feitos} de {exec.resultados.length} passos prontos.{" "}
          {rodando
            ? "O fluxo avança enquanto esta página estiver aberta; se fechar, ele continua de onde parou quando você voltar."
            : atual?.estado === "erro"
              ? "Parou num erro: tente de novo ou pule o passo."
              : "Pausado: clique em Continuar para seguir de onde parou."}
        </p>
      )}
      {falha && (
        <div className="mb-4">
          <Alert title="Não foi possível continuar">{falha}</Alert>
        </div>
      )}

      <Card>
        <CardHeader title="Passos" subtitle={exec.contexto ? `Contexto: ${exec.contexto}` : undefined} />
        <ol className="divide-y divide-slate-100">
          {exec.passos.map((p, i) => {
            const r = exec.resultados.find((x) => x.passoId === p.id) ?? { passoId: p.id, estado: "pendente" as const };
            const ativo = rodando && atual?.passoId === p.id;
            return (
              <li key={p.id} className="flex gap-3 px-5 py-4">
                <div className="pt-0.5">
                  <IconeEstado r={r} ativo={ativo} />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {i + 1}. {FERRAMENTA_FLUXO_LABEL[p.ferramenta]}
                    </p>
                    <p className="line-clamp-2 text-xs text-slate-500">{descreverPasso(p)}</p>
                  </div>
                  {r.total !== undefined && r.total > 0 && r.estado !== "feito" && (
                    <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={r.feitos ?? 0} aria-valuemax={r.total} aria-label="Processos lidos">
                      <div className="h-full bg-brand-500 transition-all" style={{ width: `${Math.round(((r.feitos ?? 0) / r.total) * 100)}%` }} />
                    </div>
                  )}
                  {r.resumo && <p className="text-sm text-slate-700">{r.resumo}</p>}
                  {r.estado === "erro" && (
                    <div className="space-y-2">
                      <Alert>{r.erro ?? "O passo falhou."}</Alert>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" icon={<RotateCcw className="h-4 w-4" />} ia loading={rodando} onClick={() => void tocar()}>
                          Tentar de novo
                        </Button>
                        <Button size="sm" variant="secondary" icon={<SkipForward className="h-4 w-4" />} disabled={rodando} onClick={() => void tocar({ pular: true })}>
                          Pular este passo
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {r.revisaoId && (
                      <Link href={`/processos/revisao/${r.revisaoId}`}>
                        <Button size="sm" variant="secondary" icon={<Table2 className="h-4 w-4" />}>
                          Abrir a tabela
                        </Button>
                      </Link>
                    )}
                    {r.fontes?.slice(0, 8).map((f) => (
                      <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
                        <ExternalLink className="h-3 w-3" aria-hidden /> {f.titulo}
                      </a>
                    ))}
                  </div>
                  {r.texto && r.estado === "feito" && (
                    <details className="group">
                      <summary className="cursor-pointer text-xs font-medium text-brand-700">Ver o que este passo produziu</summary>
                      <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-800">{r.texto}</pre>
                    </details>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      {exec.estado === "concluida" && (
        <Card className="mt-6">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <FileText className="h-4 w-4 text-brand-600" aria-hidden /> Relatório
              </span>
            }
            subtitle="Feito pela IA: confira os fatos, as páginas citadas e as fontes antes de usar ou enviar."
            action={exec.resultados.some((r) => r.estado === "erro" || r.estado === "pulado") ? <Badge className="bg-amber-50 text-amber-700">Algum passo não rodou</Badge> : undefined}
          />
          {exec.relatorio ? (
            <div className="space-y-3 p-5">
              <div className={clsx("max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 p-4 text-sm leading-relaxed text-slate-800")}>{exec.relatorio}</div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Copy className="h-4 w-4" />}
                  onClick={() =>
                    navigator.clipboard.writeText(exec.relatorio!).then(
                      () => toast("Copiado"),
                      () => toast("Não foi possível copiar", { tom: "error" }),
                    )
                  }
                >
                  Copiar
                </Button>
                <BotaoWord titulo={exec.fluxoTitulo} subtitulo={umProcesso?.rotulo} texto={exec.relatorio} />
                {umProcesso && <SalvarComoParecer processoId={umProcesso.id} texto={exec.relatorio} />}
              </div>
            </div>
          ) : (
            <p className="p-5 text-sm text-slate-500">Este fluxo não tem passo que escreva texto. O resultado está nos passos acima{exec.resultados.some((r) => r.revisaoId) ? ", na tabela" : ""}.</p>
          )}
        </Card>
      )}
    </>
  );
}
