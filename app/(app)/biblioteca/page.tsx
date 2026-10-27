"use client";

import { BookOpen, Plus, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { CartaoItem, ExcluirItem, FormItem, PesquisaExterna, useBiblioteca } from "@/components/biblioteca";
import { Alert, Button, Card, CardHeader, EmptyState, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { filtrarItens, type ItemBiblioteca, TIPO_ITEM_LABEL, type TipoItemBiblioteca, TIPOS_ITEM } from "@/lib/biblioteca";
import { AREA_LABEL, type AreaAtuacao } from "@/lib/processos";
import { useStore } from "@/lib/store";

export default function BibliotecaPage() {
  const { itens, erro, recarregar } = useBiblioteca();
  const { podeExcluir } = useStore();
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<TipoItemBiblioteca | "">("");
  const [area, setArea] = useState<AreaAtuacao | "">("");
  const [form, setForm] = useState<{ item?: ItemBiblioteca }>();
  const [excluir, setExcluir] = useState<ItemBiblioteca>();

  const filtrados = useMemo(() => filtrarItens(itens ?? [], { busca, tipo, area }), [itens, busca, tipo, area]);
  const contagem = useMemo(() => {
    const c = Object.fromEntries(TIPOS_ITEM.map((t) => [t, 0])) as Record<TipoItemBiblioteca, number>;
    for (const i of itens ?? []) c[i.tipo]++;
    return c;
  }, [itens]);
  const filtrando = !!(busca.trim() || tipo || area);

  return (
    <>
      <PageHeader
        title="Biblioteca"
        description="Modelos de peça, jurisprudência, súmulas, legislação e doutrina do escritório. A IA usa o que estiver aqui como base para redigir o parecer."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setForm({})}>
            Adicionar item
          </Button>
        }
      />

      <Card className="mb-6">
        <div className="space-y-4 p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Procure na biblioteca ou digite um tema para pesquisar nos tribunais (ex.: negativação indevida dano moral)"
              className="pl-9"
              aria-label="Procurar"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Pesquisar também fora do Clepsa</p>
            <PesquisaExterna busca={busca} />
            <p className="mt-2 text-xs text-slate-500">Abre o site numa aba nova com a busca digitada. Achou algo útil? Copie a ementa e o link e guarde aqui com “Adicionar item”.</p>
          </div>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoItemBiblioteca | "")} className="w-auto" aria-label="Tipo">
          <option value="">Todos os tipos ({itens?.length ?? 0})</option>
          {TIPOS_ITEM.map((t) => (
            <option key={t} value={t}>
              {TIPO_ITEM_LABEL[t]} ({contagem[t]})
            </option>
          ))}
        </Select>
        <Select value={area} onChange={(e) => setArea(e.target.value as AreaAtuacao | "")} className="w-auto" aria-label="Área">
          <option value="">Todas as áreas</option>
          {Object.entries(AREA_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        {filtrando && itens && (
          <span className="text-sm text-slate-500">
            {filtrados.length} de {itens.length}
          </span>
        )}
      </div>

      {erro ? (
        <Alert>{erro}</Alert>
      ) : !itens ? (
        <Spinner />
      ) : !itens.length ? (
        <Card>
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="A biblioteca está vazia"
            description="Guarde aqui os modelos de peça do escritório (em Word ou PDF), as ementas e súmulas que vocês mais usam e trechos de doutrina. Depois, na aba Parecer do processo, escolha o que a IA deve usar."
            action={
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setForm({})}>
                Adicionar o primeiro item
              </Button>
            }
          />
        </Card>
      ) : !filtrados.length ? (
        <Card>
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="Nada encontrado na biblioteca"
            description="Tente outras palavras ou use os atalhos acima para pesquisar nos sites dos tribunais."
          />
        </Card>
      ) : (
        <ul className="grid items-start gap-3 xl:grid-cols-2">
          {filtrados.map((i) => (
            <CartaoItem key={i.id} item={i} onEditar={() => setForm({ item: i })} onExcluir={podeExcluir ? () => setExcluir(i) : undefined} />
          ))}
        </ul>
      )}

      {itens && itens.length > 0 && (
        <p className="mt-6 flex items-center gap-2 text-xs text-slate-500">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Para a IA usar estes itens, abra o processo, vá à aba Parecer e clique em “Rascunho pela IA”.
        </p>
      )}

      <FormItem aberto={!!form} item={form?.item} onFechar={() => setForm(undefined)} onSalvo={() => void recarregar()} />
      <ExcluirItem item={excluir} onFechar={() => setExcluir(undefined)} onExcluido={() => void recarregar()} />
    </>
  );
}
