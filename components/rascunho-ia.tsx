"use client";

import clsx from "clsx";
import { BookOpen, FileText, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/auth/api";
import { filtrarItens, type ItemBiblioteca, sugerirParaProcesso } from "@/lib/biblioteca";
import type { AreaAtuacao } from "@/lib/processos";
import { SeloTipo, useBiblioteca } from "./biblioteca";
import { Modal } from "./modal";
import { Alert, Button, Input, Spinner, Textarea } from "./ui";
import { IaPensando } from "@/components/ia/ia-pensando";

/** Igual ao limite do servidor (LIMITES_REDACAO). */
const MAX_ITENS = 8;
const MAX_ORIENTACAO = 2000;

export interface RascunhoIa {
  texto: string;
  /** Itens da biblioteca e PDFs do processo que a IA leu. */
  fontes: string[];
  documentos: string[];
  modelo: string;
}

/** Se a redação pela IA está ligada no servidor. */
export function useRedacaoDisponivel(processoId: string) {
  const [disponivel, setDisponivel] = useState(false);
  useEffect(() => {
    let vivo = true;
    api<{ disponivel: boolean }>(`/api/processos/${processoId}/pareceres/rascunho`)
      .then((r) => vivo && setDisponivel(r.disponivel))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [processoId]);
  return disponivel;
}

function LinhaItem({ item, marcado, bloqueado, onMudar }: { item: ItemBiblioteca; marcado: boolean; bloqueado: boolean; onMudar: (v: boolean) => void }) {
  return (
    <li>
      <label className={clsx("flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-slate-50", bloqueado && !marcado && "cursor-not-allowed opacity-50")}>
        <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600" checked={marcado} disabled={bloqueado && !marcado} onChange={(e) => onMudar(e.target.checked)} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <SeloTipo tipo={item.tipo} />
            {item.referencia && <span className="text-xs text-slate-500">{item.referencia}</span>}
            {item.arquivo && <FileText className="h-3.5 w-3.5 text-slate-400" aria-label="Com arquivo" />}
          </span>
          <span className="mt-0.5 block text-sm text-slate-800">{item.titulo}</span>
        </span>
      </label>
    </li>
  );
}

/**
 * Escolha dos itens da biblioteca e da orientação para a IA redigir o rascunho do parecer.
 * O resultado vai para o editor; nada é salvo sem o advogado clicar em salvar.
 */
export function DialogoRascunhoIa({
  aberto,
  processoId,
  area,
  temParecer,
  onFechar,
  onPronto,
}: {
  aberto: boolean;
  processoId: string;
  area?: AreaAtuacao;
  temParecer: boolean;
  onFechar: () => void;
  onPronto: (r: RascunhoIa) => void;
}) {
  const { itens, erro: erroBiblioteca } = useBiblioteca();
  const [marcados, setMarcados] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [orientacao, setOrientacao] = useState("");
  const [redigindo, setRedigindo] = useState(false);
  const [erro, setErro] = useState<string>();

  useEffect(() => {
    if (aberto) setErro(undefined);
  }, [aberto]);

  const lista = useMemo(() => filtrarItens(sugerirParaProcesso(itens ?? [], area), { busca }), [itens, area, busca]);

  async function redigir() {
    setRedigindo(true);
    setErro(undefined);
    try {
      const { rascunho } = await api<{ rascunho: RascunhoIa }>(`/api/processos/${processoId}/pareceres/rascunho`, { body: { itens: marcados, orientacao } });
      onPronto(rascunho);
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível redigir o rascunho.");
    } finally {
      setRedigindo(false);
    }
  }

  return (
    <Modal
      open={aberto}
      onClose={() => !redigindo && onFechar()}
      title="Rascunho do parecer pela IA"
      footer={
        <>
          <Button variant="secondary" onClick={onFechar} disabled={redigindo}>
            Cancelar
          </Button>
          <Button icon={<Sparkles className="h-4 w-4" />} ia loading={redigindo} onClick={() => void redigir()}>
            {redigindo ? "Redigindo…" : "Redigir rascunho"}
          </Button>
        </>
      }
    >
      {redigindo ? (
        <div className="py-4">
          <IaPensando label="A IA está lendo os documentos e redigindo. Pode levar alguns minutos…" />
        </div>
      ) : (
        <div className="-mx-5 max-h-[68vh] space-y-4 overflow-y-auto px-5">
          {erro && <Alert>{erro}</Alert>}
          <p className="text-sm text-slate-600">
            A IA lê os PDFs do processo{temParecer ? ", o parecer atual" : ""} e a última análise de risco, e usa como base os itens da biblioteca que você marcar. O texto
            vai para o editor para você revisar; nada é salvo sozinho.
          </p>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">Itens da biblioteca</p>
              <span className="text-xs text-slate-500">
                {marcados.length} de até {MAX_ITENS}
              </span>
            </div>
            {erroBiblioteca ? (
              <Alert>{erroBiblioteca}</Alert>
            ) : !itens ? (
              <Spinner />
            ) : !itens.length ? (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">
                <BookOpen className="mx-auto mb-2 h-5 w-5 text-slate-400" aria-hidden />
                A biblioteca está vazia. A IA pode redigir só com os PDFs do processo, ou você pode{" "}
                <Link href="/biblioteca" className="font-medium text-brand-700 hover:underline">
                  guardar modelos e jurisprudência
                </Link>{" "}
                antes.
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar itens" className="pl-9" aria-label="Filtrar itens" />
                </div>
                <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                  {lista.map((i) => (
                    <LinhaItem
                      key={i.id}
                      item={i}
                      marcado={marcados.includes(i.id)}
                      bloqueado={marcados.length >= MAX_ITENS}
                      onMudar={(v) => setMarcados((m) => (v ? [...m, i.id] : m.filter((x) => x !== i.id)))}
                    />
                  ))}
                  {!lista.length && <li className="px-4 py-3 text-sm text-slate-500">Nenhum item com essas palavras.</li>}
                </ul>
                {area && <p className="mt-1 text-xs text-slate-500">Os itens da mesma área do processo aparecem primeiro.</p>}
              </>
            )}
          </div>

          <div>
            <label htmlFor="orientacao-ia" className="mb-1.5 block text-sm font-medium text-slate-700">
              Orientação para a IA <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <Textarea
              id="orientacao-ia"
              rows={3}
              maxLength={MAX_ORIENTACAO}
              value={orientacao}
              onChange={(e) => setOrientacao(e.target.value)}
              placeholder="Ex.: foque na prescrição; o cliente quer acordo; use o modelo do escritório."
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
