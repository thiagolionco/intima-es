"use client";

import { Download, ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { api, ErroApi } from "@/lib/auth/api";
import { type DocumentoProcesso, formatarTamanho, LIMITES_DOCUMENTO } from "@/lib/processos";
import { formatDateTime } from "@/lib/utils";
import { ConfirmDialog } from "./modal";
import { useToast } from "./toast";
import { Alert, Button, Card, CardHeader, EmptyState, Spinner } from "./ui";

/** Lista dos PDFs do processo, lida do servidor. */
export function useDocumentos(processoId: string) {
  const [documentos, setDocumentos] = useState<DocumentoProcesso[]>();
  const [erro, setErro] = useState<string>();

  const recarregar = useCallback(async () => {
    try {
      setDocumentos((await api<{ documentos: DocumentoProcesso[] }>(`/api/processos/${processoId}/documentos`)).documentos);
      setErro(undefined);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar os documentos.");
    }
  }, [processoId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { documentos, erro, recarregar };
}

const urlDocumento = (processoId: string, id: string) => `/api/processos/${processoId}/documentos/${id}`;

export function DocumentosDoProcesso({ processoId, documentos, erro, recarregar }: { processoId: string } & ReturnType<typeof useDocumentos>) {
  const { toast } = useToast();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState<{ atual: number; total: number }>();
  const [arrastando, setArrastando] = useState(false);
  const [excluir, setExcluir] = useState<DocumentoProcesso>();

  async function enviar(arquivos: File[]) {
    if (!arquivos.length || enviando) return;
    const falhas: string[] = [];
    let enviados = 0;
    for (const [i, arquivo] of arquivos.entries()) {
      setEnviando({ atual: i + 1, total: arquivos.length });
      if (arquivo.size > LIMITES_DOCUMENTO.bytes) {
        falhas.push(`${arquivo.name}: passa de ${LIMITES_DOCUMENTO.bytes / (1024 * 1024)} MB.`);
        continue;
      }
      const form = new FormData();
      form.append("arquivo", arquivo);
      try {
        await api(`/api/processos/${processoId}/documentos`, { body: form });
        enviados++;
      } catch (e) {
        falhas.push(`${arquivo.name}: ${e instanceof ErroApi ? e.message : "não foi possível enviar."}`);
      }
    }
    setEnviando(undefined);
    if (entrada.current) entrada.current.value = "";
    await recarregar();
    if (enviados) toast(enviados === 1 ? "PDF anexado" : `${enviados} PDFs anexados`);
    for (const f of falhas) toast(f, { tom: "error" });
  }

  function soltar(e: DragEvent) {
    e.preventDefault();
    setArrastando(false);
    void enviar(Array.from(e.dataTransfer.files));
  }

  const botao = (
    <Button
      size="sm"
      icon={<Upload className="h-4 w-4" />}
      loading={!!enviando}
      onClick={() => entrada.current?.click()}
    >
      {enviando ? `Enviando ${enviando.atual} de ${enviando.total}…` : "Anexar PDF"}
    </Button>
  );

  return (
    <Card>
      <input ref={entrada} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => void enviar(Array.from(e.target.files ?? []))} />
      <CardHeader title="Documentos" subtitle={`PDFs de até ${LIMITES_DOCUMENTO.bytes / (1024 * 1024)} MB. Ficam guardados só para o escritório.`} action={botao} />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={soltar}
        className={arrastando ? "bg-brand-50 ring-2 ring-inset ring-brand-300" : undefined}
      >
        {erro && (
          <div className="p-5">
            <Alert>{erro}</Alert>
          </div>
        )}
        {!documentos && !erro ? (
          <Spinner />
        ) : !documentos?.length ? (
          !erro && (
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="Nenhum PDF anexado"
              description="Anexe a petição inicial, a contestação, decisões ou outras peças. Você também pode arrastar os arquivos para cá."
            />
          )
        ) : (
          <ul className="divide-y divide-slate-100">
            {documentos.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                <FileText className="h-5 w-5 shrink-0 text-red-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <a href={urlDocumento(processoId, d.id)} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-slate-800 hover:text-brand-700 hover:underline">
                    {d.nome}
                  </a>
                  <p className="text-xs text-slate-500">
                    {formatarTamanho(d.tamanho)} · anexado em {formatDateTime(d.criadoEm)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <a href={urlDocumento(processoId, d.id)} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={`Abrir ${d.nome}`} title="Abrir">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <a href={`${urlDocumento(processoId, d.id)}?baixar=1`} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={`Baixar ${d.nome}`} title="Baixar">
                    <Download className="h-4 w-4" />
                  </a>
                  <button onClick={() => setExcluir(d)} className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label={`Excluir ${d.nome}`} title="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!excluir}
        onClose={() => setExcluir(undefined)}
        title="Excluir PDF?"
        description={
          <>
            O arquivo <strong>{excluir?.nome}</strong> será apagado do processo. Esta ação não pode ser desfeita.
          </>
        }
        onConfirm={async () => {
          if (!excluir) return;
          try {
            await api(urlDocumento(processoId, excluir.id), { method: "DELETE" });
            toast("PDF excluído");
          } catch (e) {
            toast(e instanceof Error ? e.message : "Não foi possível excluir", { tom: "error" });
          }
          await recarregar();
        }}
      />
    </Card>
  );
}
