"use client";

import { History, NotebookPen, Pencil, RotateCcw, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ErroApi } from "@/lib/auth/api";
import { LIMITES_PARECER, type ParecerProcesso } from "@/lib/processos";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "./toast";
import { Alert, Button, Card, CardHeader, EmptyState, Spinner, Textarea } from "./ui";

/**
 * Versões do parecer, lidas do servidor, e o rascunho em edição. Fica na página do processo para
 * o rascunho não se perder ao trocar de aba.
 */
export function usePareceres(processoId: string) {
  const [pareceres, setPareceres] = useState<ParecerProcesso[]>();
  const [erro, setErro] = useState<string>();
  /** Texto em edição; undefined quando o editor está fechado. */
  const [rascunho, setRascunho] = useState<string>();
  /** Versão que estava na tela quando a edição começou. */
  const [baseVersao, setBaseVersao] = useState(0);

  const recarregar = useCallback(async () => {
    try {
      const lista = (await api<{ pareceres: ParecerProcesso[] }>(`/api/processos/${processoId}/pareceres`)).pareceres;
      setPareceres(lista);
      setErro(undefined);
      return lista;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o parecer.");
    }
  }, [processoId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const editar = (texto: string) => {
    setBaseVersao(pareceres?.[0]?.versao ?? 0);
    setRascunho(texto);
  };

  return { pareceres, erro, recarregar, rascunho, setRascunho, baseVersao, setBaseVersao, editar, fechar: () => setRascunho(undefined) };
}

type Estado = ReturnType<typeof usePareceres>;

const descricao = (p: ParecerProcesso) => `Versão ${p.versao} · ${p.autorNome} · ${formatDateTime(p.criadoEm)}`;

function Editor({ processoId, estado }: { processoId: string; estado: Estado }) {
  const { toast } = useToast();
  const { rascunho = "", setRascunho, baseVersao, setBaseVersao, recarregar, fechar } = estado;
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tom: "error" | "warning"; texto: string; outra?: ParecerProcesso }>();
  const excedeu = rascunho.length > LIMITES_PARECER.caracteres;

  async function salvar() {
    setSalvando(true);
    setAviso(undefined);
    try {
      await api(`/api/processos/${processoId}/pareceres`, { body: { texto: rascunho, baseVersao } });
      await recarregar();
      fechar();
      toast(baseVersao ? `Versão ${baseVersao + 1} salva` : "Parecer salvo");
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === "conflito") {
        // Mostra a versão que chegou e mantém o texto no editor; salvar de novo cria a seguinte.
        const outra = (await recarregar())?.[0];
        setBaseVersao(outra?.versao ?? 0);
        setAviso({
          tom: "warning",
          texto: outra
            ? `${outra.autorNome} salvou a versão ${outra.versao} enquanto você editava. Confira o texto dela abaixo; o seu continua no editor e, se salvar, vira a versão ${outra.versao + 1}.`
            : e.message,
          outra,
        });
      } else {
        setAviso({ tom: "error", texto: e instanceof Error ? e.message : "Não foi possível salvar." });
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3 p-5">
      {aviso && <Alert tone={aviso.tom}>{aviso.texto}</Alert>}
      {aviso?.outra && (
        <details className="rounded-lg border border-slate-200" open>
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-slate-700">{descricao(aviso.outra)}</summary>
          <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words border-t border-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700">{aviso.outra.texto}</p>
        </details>
      )}
      <label htmlFor="parecer" className="sr-only">
        Texto do parecer
      </label>
      <Textarea
        id="parecer"
        rows={16}
        autoFocus
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        placeholder="Resumo do caso, teses, pontos fortes e fracos, chance de êxito, estratégia recomendada…"
        invalid={excedeu}
        className="leading-relaxed"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={excedeu ? "text-xs font-medium text-red-600" : "text-xs text-slate-500"}>
          {rascunho.length.toLocaleString("pt-BR")} de {LIMITES_PARECER.caracteres.toLocaleString("pt-BR")} caracteres
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={fechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button icon={<Save className="h-4 w-4" />} loading={salvando} disabled={!rascunho.trim() || excedeu} onClick={() => void salvar()}>
            {baseVersao ? "Salvar nova versão" : "Salvar parecer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ParecerDoProcesso({ processoId, estado }: { processoId: string; estado: Estado }) {
  const { pareceres, erro, rascunho, editar } = estado;
  const [atual, ...anteriores] = pareceres ?? [];
  const editando = rascunho !== undefined;

  const acao =
    atual && !editando ? (
      <Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => editar(atual.texto)}>
        Editar parecer
      </Button>
    ) : undefined;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Parecer"
          subtitle={atual ? descricao(atual) : "Análise prévia do escritório. Cada vez que você salva, vira uma versão nova; as anteriores ficam guardadas."}
          action={acao}
        />
        {erro ? (
          <div className="p-5">
            <Alert>{erro}</Alert>
          </div>
        ) : !pareceres ? (
          <Spinner />
        ) : editando ? (
          <Editor processoId={processoId} estado={estado} />
        ) : atual ? (
          <p className="whitespace-pre-wrap break-words p-5 text-sm leading-relaxed text-slate-800">{atual.texto}</p>
        ) : (
          <EmptyState
            icon={<NotebookPen className="h-6 w-6" />}
            title="Nenhum parecer ainda"
            description="Registre a análise prévia do caso: teses, riscos, chance de êxito e a estratégia. Fica com autor e data, e cada alteração guarda a versão anterior."
            action={
              <Button icon={<NotebookPen className="h-4 w-4" />} onClick={() => editar("")}>
                Escrever parecer
              </Button>
            }
          />
        )}
      </Card>

      {anteriores.length > 0 && (
        <Card>
          <CardHeader title="Versões anteriores" subtitle={`${anteriores.length} ${anteriores.length === 1 ? "versão" : "versões"}, da mais nova para a mais antiga.`} />
          <ul className="divide-y divide-slate-100">
            {anteriores.map((p) => (
              <li key={p.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm text-slate-700 hover:bg-slate-50">
                    <History className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{descricao(p)}</span>
                    <span className="text-xs text-slate-400 group-open:hidden">Ver</span>
                  </summary>
                  <div className="space-y-3 px-5 pb-4">
                    <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">{p.texto}</p>
                    {!editando && (
                      <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => editar(p.texto)}>
                        Usar este texto numa nova versão
                      </Button>
                    )}
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
