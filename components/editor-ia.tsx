"use client";

import { Check, CheckCheck, FileDown, Languages, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/auth/api";
import { baixarArquivo, nomeDeArquivo, TIPO_DOCX } from "@/lib/baixar";
import { ACAO_EDITOR_LABEL, type AcaoEditor, aplicarSugestao, IDIOMA_LABEL, type SugestaoEditor } from "@/lib/editor";
import type { ResumoEscritorio } from "@/lib/escritorio";
import { gerarDocx } from "@/lib/exportacao/docx";
import { mensagemDe, useApi } from "@/lib/use-api";
import { formatDate, hojeISO } from "@/lib/utils";
import { useToast } from "./toast";
import { Alert, Button, Input, Select } from "./ui";

/** Baixa o texto como documento Word, com o nome do escritório no cabeçalho. */
export async function baixarWord(titulo: string, texto: string, subtitulo?: string) {
  const escritorio = await api<ResumoEscritorio>("/api/escritorio")
    .then((r) => r.nome)
    .catch(() => undefined);
  const docx = gerarDocx({ escritorio, titulo, subtitulo, texto, rodape: `Gerado pelo Clepsa em ${formatDate(hojeISO())}` });
  baixarArquivo(docx, `${nomeDeArquivo(`${titulo}${subtitulo ? ` - ${subtitulo}` : ""}`)}.docx`, TIPO_DOCX);
}

export function BotaoWord({ titulo, texto, subtitulo, rotulo = "Baixar Word" }: { titulo: string; texto: string; subtitulo?: string; rotulo?: string }) {
  const [baixando, setBaixando] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={<FileDown className="h-4 w-4" />}
      loading={baixando}
      disabled={!texto.trim()}
      onClick={async () => {
        setBaixando(true);
        try {
          await baixarWord(titulo, texto, subtitulo);
        } finally {
          setBaixando(false);
        }
      }}
    >
      {rotulo}
    </Button>
  );
}

type Resultado = { acao: AcaoEditor; sugestoes: SugestaoEditor[] } | { acao: "traduzir"; traducao: string; idioma: string };

/**
 * IA dentro do editor do parecer: revisa, melhora a redação ou anonimiza propondo trocas pontuais
 * (aceitar ou recusar uma a uma, como no controle de alterações do Word) e traduz o texto inteiro.
 */
export function FerramentasEditorIa({ processoId, texto, onTexto, titulo }: { processoId: string; texto: string; onTexto: (t: string) => void; titulo: string }) {
  const { toast } = useToast();
  const { dados } = useApi<{ disponivel: boolean }>(`/api/processos/${processoId}/pareceres/editor`);
  const [rodando, setRodando] = useState<AcaoEditor>();
  const [idioma, setIdioma] = useState("en");
  const [orientacao, setOrientacao] = useState("");
  const [resultado, setResultado] = useState<Resultado>();

  if (!dados?.disponivel) return null;

  async function executar(acao: AcaoEditor) {
    setRodando(acao);
    setResultado(undefined);
    try {
      const r = await api<{ sugestoes: SugestaoEditor[] } | { traducao: string; idioma: string }>(`/api/processos/${processoId}/pareceres/editor`, {
        body: { acao, texto, idioma: acao === "traduzir" ? idioma : undefined, orientacao: orientacao.trim() || undefined },
      });
      if ("traducao" in r) setResultado({ acao: "traduzir", ...r });
      else {
        setResultado({ acao, sugestoes: r.sugestoes });
        if (!r.sugestoes.length) toast("A IA não sugeriu nenhuma troca");
      }
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    } finally {
      setRodando(undefined);
    }
  }

  function aceitar(s: SugestaoEditor) {
    const novo = aplicarSugestao(texto, s);
    if (novo === null) toast("Esse trecho já mudou no texto; a sugestão foi descartada.", { tom: "error" });
    else onTexto(novo);
    tirar(s);
  }

  function aceitarTodas(lista: SugestaoEditor[]) {
    let atual = texto;
    let falhas = 0;
    for (const s of lista) {
      const novo = aplicarSugestao(atual, s);
      if (novo === null) falhas++;
      else atual = novo;
    }
    onTexto(atual);
    setResultado(undefined);
    toast(falhas ? `${lista.length - falhas} troca(s) aplicada(s); ${falhas} já não cabiam no texto` : `${lista.length} troca(s) aplicada(s)`);
  }

  const tirar = (s: SugestaoEditor) =>
    setResultado((r) => {
      if (!r || !("sugestoes" in r)) return r;
      const sugestoes = r.sugestoes.filter((x) => x.id !== s.id);
      return sugestoes.length ? { ...r, sugestoes } : undefined;
    });

  return (
    <div className="space-y-3 rounded-lg border border-brand-100 bg-brand-50/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-600" aria-hidden />
        {(["revisar", "melhorar", "anonimizar"] as const).map((a) => (
          <Button key={a} size="sm" variant="secondary" ia loading={rodando === a} disabled={!!rodando || !texto.trim()} onClick={() => void executar(a)}>
            {ACAO_EDITOR_LABEL[a]}
          </Button>
        ))}
        <span className="inline-flex items-center gap-1">
          <Select value={idioma} onChange={(e) => setIdioma(e.target.value)} className="h-8 w-auto py-0 text-sm" aria-label="Idioma da tradução">
            {Object.entries(IDIOMA_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" icon={<Languages className="h-4 w-4" />} ia loading={rodando === "traduzir"} disabled={!!rodando || !texto.trim()} onClick={() => void executar("traduzir")}>
            Traduzir
          </Button>
        </span>
      </div>
      <Input value={orientacao} onChange={(e) => setOrientacao(e.target.value)} maxLength={500} placeholder="Orientação opcional (ex.: deixar mais curto para o cliente; manter o nome do juiz)" aria-label="Orientação para a IA" />

      {resultado && "sugestoes" in resultado && resultado.sugestoes.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-800">
              {ACAO_EDITOR_LABEL[resultado.acao]}: {resultado.sugestoes.length} sugestão(ões)
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" icon={<CheckCheck className="h-4 w-4" />} onClick={() => aceitarTodas(resultado.sugestoes)}>
                Aceitar todas
              </Button>
              <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => setResultado(undefined)}>
                Recusar todas
              </Button>
            </div>
          </div>
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {resultado.sugestoes.map((s) => (
              <li key={s.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <p className="whitespace-pre-wrap break-words">
                  <del className="bg-red-50 text-red-700">{s.original}</del>
                  {s.novo && (
                    <>
                      {" "}
                      <ins className="bg-emerald-50 text-emerald-800 no-underline">{s.novo}</ins>
                    </>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">{s.motivo}</p>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" icon={<Check className="h-4 w-4" />} onClick={() => aceitar(s)}>
                      Aceitar
                    </Button>
                    <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => tirar(s)}>
                      Recusar
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {resultado && "traducao" in resultado && (
        <div className="space-y-2">
          <Alert tone="info">Tradução para o {IDIOMA_LABEL[resultado.idioma] ?? resultado.idioma}. Revise termos técnicos antes de enviar.</Alert>
          <p className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-800">{resultado.traducao}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <BotaoWord titulo={titulo} subtitulo={`Tradução (${IDIOMA_LABEL[resultado.idioma] ?? resultado.idioma})`} texto={resultado.traducao} rotulo="Baixar tradução em Word" />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(resultado.traducao).then(() => toast("Tradução copiada"));
              }}
            >
              Copiar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setResultado(undefined)}>
              Fechar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
