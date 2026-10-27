"use client";

import clsx from "clsx";
import { Check, Copy, Download, ExternalLink, FileText, Globe, Pencil, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ErroApi } from "@/lib/auth/api";
import {
  type DadosItemBiblioteca,
  type ErrosItemBiblioteca,
  FONTES_PESQUISA,
  type ItemBiblioteca,
  LIMITES_BIBLIOTECA,
  pesquisaNoTribunal,
  TIPO_ITEM_LABEL,
  type TipoItemBiblioteca,
  TIPOS_ITEM,
  validarItem,
} from "@/lib/biblioteca";
import { AREA_LABEL, type AreaAtuacao, formatarTamanho } from "@/lib/processos";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/utils";
import { ConfirmDialog, Modal } from "./modal";
import { useToast } from "./toast";
import { Button, Field, Input, Select, Textarea } from "./ui";

/** Itens da biblioteca, lidos do servidor. */
export function useBiblioteca() {
  const [itens, setItens] = useState<ItemBiblioteca[]>();
  const [erro, setErro] = useState<string>();

  const recarregar = useCallback(async () => {
    try {
      setItens((await api<{ itens: ItemBiblioteca[] }>("/api/biblioteca")).itens);
      setErro(undefined);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar a biblioteca.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { itens, erro, recarregar };
}

const COR_TIPO: Record<TipoItemBiblioteca, string> = {
  modelo: "bg-brand-50 text-brand-700",
  jurisprudencia: "bg-violet-50 text-violet-700",
  sumula: "bg-amber-50 text-amber-800",
  legislacao: "bg-emerald-50 text-emerald-700",
  doutrina: "bg-sky-50 text-sky-700",
};

/** Selo do tipo, com uma cor por tipo. */
export function SeloTipo({ tipo }: { tipo: TipoItemBiblioteca }) {
  return <span className={clsx("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", COR_TIPO[tipo])}>{TIPO_ITEM_LABEL[tipo]}</span>;
}

export const urlArquivo = (id: string) => `/api/biblioteca/${id}`;

type Rascunho = { tipo: TipoItemBiblioteca | ""; titulo: string; referencia: string; tribunal: string; area: AreaAtuacao | ""; texto: string; etiquetas: string; link: string };

const VAZIO: Rascunho = { tipo: "", titulo: "", referencia: "", tribunal: "", area: "", texto: "", etiquetas: "", link: "" };

function paraRascunho(i: ItemBiblioteca): Rascunho {
  return {
    tipo: i.tipo,
    titulo: i.titulo,
    referencia: i.referencia ?? "",
    tribunal: i.tribunal ?? "",
    area: i.area ?? "",
    texto: i.texto ?? "",
    etiquetas: i.etiquetas.join(", "),
    link: i.link ?? "",
  };
}

function paraDados(r: Rascunho): Partial<Record<keyof DadosItemBiblioteca, unknown>> {
  return { ...r, tipo: r.tipo || undefined, area: r.area || undefined, etiquetas: r.etiquetas };
}

/** Criar ou editar um item. Ao criar, aceita um PDF ou .docx. */
export function FormItem({
  aberto,
  item,
  onFechar,
  onSalvo,
}: {
  aberto: boolean;
  /** Item em edição; ausente para criar. */
  item?: ItemBiblioteca;
  onFechar: () => void;
  onSalvo: (i: ItemBiblioteca) => void;
}) {
  const { toast } = useToast();
  const [r, setR] = useState<Rascunho>(VAZIO);
  const [arquivo, setArquivo] = useState<File>();
  const [erros, setErros] = useState<ErrosItemBiblioteca>({});
  const [salvando, setSalvando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) return;
    setR(item ? paraRascunho(item) : VAZIO);
    setArquivo(undefined);
    setErros({});
  }, [aberto, item]);

  const muda = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((x) => ({ ...x, [k]: v }));

  async function salvar() {
    const dados = paraDados(r);
    const e = validarItem(dados, !!arquivo || !!item?.arquivo);
    if (arquivo && arquivo.size > LIMITES_BIBLIOTECA.bytes) e.arquivo = `O arquivo passa de ${LIMITES_BIBLIOTECA.bytes / (1024 * 1024)} MB.`;
    setErros(e);
    if (Object.keys(e).length) return;
    setSalvando(true);
    try {
      let salvo: ItemBiblioteca;
      if (item) {
        salvo = (await api<{ item: ItemBiblioteca }>(urlArquivo(item.id), { method: "PATCH", body: dados })).item;
      } else {
        const form = new FormData();
        form.append("dados", JSON.stringify(dados));
        if (arquivo) form.append("arquivo", arquivo);
        salvo = (await api<{ item: ItemBiblioteca }>("/api/biblioteca", { body: form })).item;
      }
      toast(item ? "Item atualizado" : "Item guardado na biblioteca");
      onSalvo(salvo);
      onFechar();
    } catch (err) {
      const campo = err instanceof ErroApi ? (err.campo as keyof ErrosItemBiblioteca | undefined) : undefined;
      if (campo) setErros({ [campo]: err instanceof Error ? err.message : "Inválido." });
      else toast(err instanceof Error ? err.message : "Não foi possível salvar.", { tom: "error" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      title={item ? "Editar item da biblioteca" : "Novo item da biblioteca"}
      footer={
        <>
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button loading={salvando} onClick={() => void salvar()}>
            {item ? "Salvar" : "Guardar"}
          </Button>
        </>
      }
    >
      <div className="-mx-5 max-h-[68vh] space-y-4 overflow-y-auto px-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo" htmlFor="bib-tipo" required error={erros.tipo}>
            <Select id="bib-tipo" value={r.tipo} onChange={(e) => muda("tipo", e.target.value as TipoItemBiblioteca)} invalid={!!erros.tipo}>
              <option value="">Escolha…</option>
              {TIPOS_ITEM.map((t) => (
                <option key={t} value={t}>
                  {TIPO_ITEM_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Área" htmlFor="bib-area" error={erros.area}>
            <Select id="bib-area" value={r.area} onChange={(e) => muda("area", e.target.value as AreaAtuacao)}>
              <option value="">Qualquer área</option>
              {Object.entries(AREA_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Título" htmlFor="bib-titulo" required error={erros.titulo}>
          <Input id="bib-titulo" value={r.titulo} onChange={(e) => muda("titulo", e.target.value)} invalid={!!erros.titulo} placeholder="Ex.: Inscrição indevida no SPC gera dano moral presumido" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <Field label="Referência" htmlFor="bib-ref" error={erros.referencia} hint="Súmula, número do acórdão ou artigo.">
            <Input id="bib-ref" value={r.referencia} onChange={(e) => muda("referencia", e.target.value)} placeholder="Súmula 385/STJ" />
          </Field>
          <Field label="Tribunal" htmlFor="bib-trib" error={erros.tribunal}>
            <Input id="bib-trib" value={r.tribunal} onChange={(e) => muda("tribunal", e.target.value)} placeholder="STJ" />
          </Field>
        </div>
        <Field label={r.tipo === "modelo" ? "Texto do modelo" : "Ementa, enunciado ou trecho"} htmlFor="bib-texto" error={erros.texto} hint={item?.arquivo || arquivo ? "Opcional: o arquivo já serve de conteúdo." : "Cole o texto ou anexe um arquivo abaixo."}>
          <Textarea id="bib-texto" rows={7} value={r.texto} onChange={(e) => muda("texto", e.target.value)} invalid={!!erros.texto} className="leading-relaxed" />
        </Field>
        {!item && (
          <Field label="Arquivo" error={erros.arquivo} hint={`PDF ou Word (.docx), até ${LIMITES_BIBLIOTECA.bytes / (1024 * 1024)} MB.`}>
            <input
              ref={entrada}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => setArquivo(e.target.files?.[0])}
            />
            <div className="flex items-center gap-3">
              <Button type="button" size="sm" variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => entrada.current?.click()}>
                {arquivo ? "Trocar arquivo" : "Escolher arquivo"}
              </Button>
              {arquivo && (
                <span className="min-w-0 truncate text-sm text-slate-600">
                  {arquivo.name} · {formatarTamanho(arquivo.size)}
                </span>
              )}
            </div>
          </Field>
        )}
        {item?.arquivo && (
          <p className="text-xs text-slate-500">
            Arquivo: {item.arquivo.nome}. Para trocar o arquivo, exclua o item e guarde de novo.
          </p>
        )}
        <Field label="Etiquetas" htmlFor="bib-etq" error={erros.etiquetas} hint="Separe por vírgula. Ex.: dano moral, negativação">
          <Input id="bib-etq" value={r.etiquetas} onChange={(e) => muda("etiquetas", e.target.value)} />
        </Field>
        <Field label="Link da fonte" htmlFor="bib-link" error={erros.link}>
          <Input id="bib-link" type="url" value={r.link} onChange={(e) => muda("link", e.target.value)} placeholder="https://…" invalid={!!erros.link} />
        </Field>
      </div>
    </Modal>
  );
}

function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(texto).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        });
      }}
      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      title="Copiar texto"
      aria-label="Copiar texto"
    >
      {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

export function CartaoItem({ item, onEditar, onExcluir }: { item: ItemBiblioteca; onEditar: () => void; onExcluir?: () => void }) {
  const detalhes = [item.referencia, item.tribunal, item.area && AREA_LABEL[item.area]].filter(Boolean).join(" · ");
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <SeloTipo tipo={item.tipo} />
            {detalhes && <span className="text-xs text-slate-500">{detalhes}</span>}
          </div>
          <h3 className="text-sm font-semibold text-slate-900">{item.titulo}</h3>
        </div>
        <div className="flex shrink-0 gap-0.5">
          {item.texto && <BotaoCopiar texto={item.texto} />}
          {item.link && (
            <a href={item.link} target="_blank" rel="noreferrer noopener" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Abrir a fonte" aria-label="Abrir a fonte">
              <Globe className="h-4 w-4" />
            </a>
          )}
          <button onClick={onEditar} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Editar" aria-label={`Editar ${item.titulo}`}>
            <Pencil className="h-4 w-4" />
          </button>
          {onExcluir && (
            <button onClick={onExcluir} className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Excluir" aria-label={`Excluir ${item.titulo}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {item.texto && <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{item.texto}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500">
        {item.arquivo && (
          <span className="inline-flex items-center gap-1.5">
            <FileText className={clsx("h-4 w-4", item.arquivo.formato === "pdf" ? "text-red-500" : "text-blue-600")} aria-hidden />
            {item.arquivo.formato === "pdf" && (
              <a href={urlArquivo(item.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-brand-700 hover:underline">
                {item.arquivo.nome}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
            {item.arquivo.formato !== "pdf" && <span className="font-medium text-slate-700">{item.arquivo.nome}</span>}
            <span>· {formatarTamanho(item.arquivo.tamanho)}</span>
            <a href={`${urlArquivo(item.id)}?baixar=1`} className="rounded p-0.5 hover:bg-slate-100 hover:text-slate-800" title="Baixar" aria-label={`Baixar ${item.arquivo.nome}`}>
              <Download className="h-3.5 w-3.5" />
            </a>
          </span>
        )}
        {item.etiquetas.map((e) => (
          <span key={e} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
            #{e}
          </span>
        ))}
        <span className="ml-auto">
          {item.autorNome} · {formatDate(item.atualizadoEm.slice(0, 10))}
        </span>
      </div>
    </li>
  );
}

/** Atalhos para pesquisar o mesmo termo nos sites públicos de jurisprudência e legislação. */
export function PesquisaExterna({ busca }: { busca: string }) {
  const [tribunal, setTribunal] = useState("");
  const termo = busca.trim();
  const noTribunal = termo && tribunal ? pesquisaNoTribunal(tribunal, termo) : undefined;
  const classeLink = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-brand-300 hover:text-brand-700";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {FONTES_PESQUISA.map((f) =>
          termo ? (
            <a key={f.id} href={f.url(termo)} target="_blank" rel="noreferrer noopener" className={classeLink} title={f.descricao}>
              {f.nome}
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            </a>
          ) : (
            <span key={f.id} className={clsx(classeLink, "cursor-not-allowed opacity-50")} title="Digite o que procurar">
              {f.nome}
            </span>
          ),
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <label htmlFor="pesq-tribunal">No site do tribunal:</label>
        <Input id="pesq-tribunal" value={tribunal} onChange={(e) => setTribunal(e.target.value)} placeholder="TJSP, TRT2, TRF3…" className="w-40" />
        {noTribunal ? (
          <a href={noTribunal} target="_blank" rel="noreferrer noopener" className={classeLink}>
            Pesquisar no {tribunal.trim().toUpperCase()}
            <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          </a>
        ) : (
          tribunal.trim() && <span className="text-xs text-slate-500">{termo ? "Sigla não reconhecida." : "Digite o que procurar."}</span>
        )}
      </div>
    </div>
  );
}

/** Confirmação da exclusão, só para quem pode excluir. */
export function ExcluirItem({ item, onFechar, onExcluido }: { item?: ItemBiblioteca; onFechar: () => void; onExcluido: () => void }) {
  const { toast } = useToast();
  const { podeExcluir } = useStore();
  if (!podeExcluir) return null;
  return (
    <ConfirmDialog
      open={!!item}
      onClose={onFechar}
      title="Excluir item da biblioteca?"
      description={
        <>
          <strong>{item?.titulo}</strong> {item?.arquivo ? "e o arquivo anexado serão apagados" : "será apagado"} para todo o escritório. Esta ação não pode ser desfeita.
        </>
      }
      onConfirm={async () => {
        if (!item) return;
        try {
          await api(urlArquivo(item.id), { method: "DELETE" });
          toast("Item excluído");
        } catch (e) {
          toast(e instanceof Error ? e.message : "Não foi possível excluir", { tom: "error" });
        }
        onExcluido();
      }}
    />
  );
}
