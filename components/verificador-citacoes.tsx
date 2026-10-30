"use client";

import clsx from "clsx";
import { AlertTriangle, BookOpen, CheckCircle2, ExternalLink, HelpCircle, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/auth/api";
import { contarPendencias, type CitacaoVerificada, extrairCitacoes, SITUACAO_CITACAO_LABEL, type SituacaoCitacao, TIPO_CITACAO_LABEL, type VerificacaoCitacoes } from "@/lib/citacoes";
import { mensagemDe, useApi } from "@/lib/use-api";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "./toast";
import { Alert, Badge, Button, Card, CardHeader } from "./ui";

/** Mesmo cálculo do servidor (sha256 do texto aparado, com quebras de linha normalizadas). */
async function hashDoTexto(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto.replace(/\r\n/g, "\n").trim());
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

const ICONE: Record<SituacaoCitacao, { icone: typeof CheckCircle2; cor: string }> = {
  confirmada: { icone: CheckCircle2, cor: "text-emerald-600" },
  na_biblioteca: { icone: BookOpen, cor: "text-emerald-600" },
  divergente: { icone: AlertTriangle, cor: "text-amber-600" },
  nao_encontrada: { icone: XCircle, cor: "text-red-600" },
  nao_verificada: { icone: HelpCircle, cor: "text-slate-400" },
};

function LinhaCitacao({ c }: { c: CitacaoVerificada }) {
  const { icone: Icone, cor } = ICONE[c.situacao];
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <Icone className={clsx("mt-0.5 h-4 w-4 shrink-0", cor)} aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium text-slate-900">
          {c.texto}
          {c.ocorrencias > 1 && <span className="ml-1 text-xs font-normal text-slate-500">({c.ocorrencias}×)</span>}
        </p>
        <p className="text-xs text-slate-500">
          {TIPO_CITACAO_LABEL[c.tipo]} · <span className={cor}>{SITUACAO_CITACAO_LABEL[c.situacao]}</span>
          {c.marcadaConferir && " · marcada [conferir]"}
        </p>
        {c.comentario && <p className="text-sm text-slate-700">{c.comentario}</p>}
        {c.fonte && (
          <a href={c.fonte.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
            <ExternalLink className="h-3 w-3" aria-hidden /> {c.fonte.titulo}
          </a>
        )}
      </div>
    </li>
  );
}

/**
 * Verificador de citações: acha súmulas, temas, precedentes e artigos no texto, confere na biblioteca
 * e, com a IA ligada, nas fontes oficiais (planalto.gov.br, STF, STJ, TST, CNJ). Substitui o aviso
 * genérico de "confira o que está marcado com [conferir]".
 */
export function VerificadorCitacoes({ processoId, texto, compacto }: { processoId: string; texto: string; compacto?: boolean }) {
  const { toast } = useToast();
  const { dados, setDados } = useApi<{ verificacao: VerificacaoCitacoes | null; pesquisaDisponivel: boolean }>(`/api/processos/${processoId}/citacoes`);
  const [hash, setHash] = useState<string>();
  const [verificando, setVerificando] = useState(false);
  const achadas = useMemo(() => extrairCitacoes(texto), [texto]);

  useEffect(() => {
    let vivo = true;
    void hashDoTexto(texto).then((h) => vivo && setHash(h));
    return () => {
      vivo = false;
    };
  }, [texto]);

  const v = dados?.verificacao ?? undefined;
  const emDia = !!v && v.hashTexto === hash;
  const pendencias = v ? contarPendencias(v) : 0;

  async function verificar() {
    setVerificando(true);
    try {
      const r = await api<{ verificacao: VerificacaoCitacoes }>("/api/citacoes", { body: { texto, processoId, pesquisar: dados?.pesquisaDisponivel } });
      setDados({ verificacao: r.verificacao, pesquisaDisponivel: dados?.pesquisaDisponivel ?? false });
      const p = contarPendencias(r.verificacao);
      toast(p ? `${p} citação(ões) pedem atenção` : "Citações conferidas", { tom: p ? "error" : undefined });
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    } finally {
      setVerificando(false);
    }
  }

  if (!texto.trim()) return null;

  const subtitulo = !achadas.length
    ? "Nenhuma súmula, tema, precedente ou artigo de lei encontrado no texto."
    : emDia
      ? `${v!.citacoes.length} citação(ões) conferida(s) por ${v!.autorNome} em ${formatDateTime(v!.criadoEm)}${v!.pesquisaOficial ? ", com pesquisa nas fontes oficiais" : ", só contra a biblioteca"}.`
      : `${achadas.length} citação(ões) no texto${v ? ". O texto mudou desde a última verificação." : ", ainda não conferidas."}`;

  return (
    <Card className={compacto ? "shadow-none" : undefined}>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden /> Verificador de citações
            {emDia && <Badge className={pendencias ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}>{pendencias ? `${pendencias} para conferir` : "Tudo certo"}</Badge>}
          </span>
        }
        subtitle={subtitulo}
        action={
          achadas.length > 0 && (
            <Button size="sm" variant={emDia ? "ghost" : "secondary"} ia loading={verificando} onClick={() => void verificar()}>
              {verificando ? "Conferindo…" : emDia ? "Conferir de novo" : "Verificar citações"}
            </Button>
          )
        }
      />
      {dados && !dados.pesquisaDisponivel && achadas.length > 0 && (
        <div className="px-5 pt-3">
          <Alert tone="info">Sem a IA configurada, só a biblioteca do escritório é conferida. O que não estiver lá fica como “não verificada”.</Alert>
        </div>
      )}
      {emDia && v!.citacoes.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {[...v!.citacoes]
            .sort((a, b) => ordem(a.situacao) - ordem(b.situacao))
            .map((c) => (
              <LinhaCitacao key={c.chave} c={c} />
            ))}
        </ul>
      )}
      {!emDia && achadas.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 px-5 py-3">
          {achadas.map((c) => (
            <li key={c.chave}>
              <Badge className={c.marcadaConferir ? "bg-amber-50 text-amber-800" : undefined}>
                {c.texto}
                {c.marcadaConferir && " [conferir]"}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Problemas primeiro. */
const ordem = (s: SituacaoCitacao) => ({ nao_encontrada: 0, divergente: 1, nao_verificada: 2, na_biblioteca: 3, confirmada: 4 })[s];
