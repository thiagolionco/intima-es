"use client";

import clsx from "clsx";
import { Lock, Pencil, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { AbasBiblioteca } from "@/components/abas-rota";
import { ConfirmDialog, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Spinner, Textarea } from "@/components/ui";
import { api, ErroApi } from "@/lib/auth/api";
import { type DadosPadrao, LIMITES_PADRAO, MODELOS_PADRAO, type PadraoIa, USO_PADRAO_LABEL, type UsoPadrao, USOS_PADRAO } from "@/lib/padroes";
import { mensagemDe, useApi } from "@/lib/use-api";

const VAZIO: DadosPadrao = { nome: "", instrucoes: "", escopo: "escritorio", usos: [], ativo: true };

function FormPadrao({ aberto, padrao, inicial, onFechar, onSalvo }: { aberto: boolean; padrao?: PadraoIa; inicial?: DadosPadrao; onFechar: () => void; onSalvo: () => void }) {
  const { toast } = useToast();
  const [d, setD] = useState<DadosPadrao>(VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [aberturaVista, setAberturaVista] = useState<unknown>();

  // Preenche ao abrir (o mesmo modal serve para criar, editar e adotar um modelo pronto).
  const chave = aberto ? (padrao ?? inicial ?? VAZIO) : undefined;
  if (chave !== aberturaVista) {
    setAberturaVista(chave);
    if (chave) {
      setD(padrao ? { nome: padrao.nome, instrucoes: padrao.instrucoes, escopo: padrao.escopo, usos: padrao.usos, ativo: padrao.ativo } : (inicial ?? VAZIO));
      setErros({});
    }
  }

  async function salvar() {
    setSalvando(true);
    try {
      await api(padrao ? `/api/padroes/${padrao.id}` : "/api/padroes", { method: padrao ? "PATCH" : "POST", body: d });
      toast(padrao ? "Padrão salvo" : "Padrão criado");
      onSalvo();
      onFechar();
    } catch (e) {
      if (e instanceof ErroApi && e.detalhes?.erros) setErros(e.detalhes.erros as Record<string, string>);
      else toast(mensagemDe(e), { tom: "error" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={aberto}
      onClose={() => !salvando && onFechar()}
      title={padrao ? "Editar padrão" : "Novo padrão da IA"}
      footer={
        <>
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button loading={salvando} onClick={() => void salvar()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="-mx-5 max-h-[68vh] space-y-4 overflow-y-auto px-5">
        <Field label="Nome" htmlFor="padrao-nome" required error={erros.nome}>
          <Input id="padrao-nome" value={d.nome} maxLength={LIMITES_PADRAO.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} placeholder="Ex.: Parecer trabalhista do escritório" />
        </Field>
        <Field label="Instruções para a IA" htmlFor="padrao-instrucoes" required error={erros.instrucoes} hint="Escreva como explicaria a um advogado novo: estrutura, tom, teses preferidas, o que nunca fazer.">
          <Textarea id="padrao-instrucoes" rows={9} value={d.instrucoes} maxLength={LIMITES_PADRAO.instrucoes} onChange={(e) => setD({ ...d, instrucoes: e.target.value })} />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Em quais tarefas a IA segue este padrão</legend>
          {erros.usos && <p className="mb-1 text-xs text-red-600">{erros.usos}</p>}
          <div className="grid gap-1.5 sm:grid-cols-2">
            {USOS_PADRAO.map((u) => (
              <label key={u} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  checked={d.usos.includes(u)}
                  onChange={(e) => setD({ ...d, usos: e.target.checked ? [...d.usos, u] : d.usos.filter((x) => x !== u) })}
                />
                {USO_PADRAO_LABEL[u]}
              </label>
            ))}
          </div>
        </fieldset>
        {!padrao && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Quem usa</legend>
            <div className="flex flex-wrap gap-4 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input type="radio" name="escopo" checked={d.escopo === "escritorio"} onChange={() => setD({ ...d, escopo: "escritorio" })} /> Todo o escritório
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="escopo" checked={d.escopo === "pessoal"} onChange={() => setD({ ...d, escopo: "pessoal" })} /> Só eu
              </label>
            </div>
          </fieldset>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={d.ativo} onChange={(e) => setD({ ...d, ativo: e.target.checked })} />
          Ligado
        </label>
      </div>
    </Modal>
  );
}

export default function PadroesPage() {
  const { dados, erro, recarregar } = useApi<{ padroes: PadraoIa[] }>("/api/padroes");
  const { toast } = useToast();
  const [form, setForm] = useState<{ padrao?: PadraoIa; inicial?: DadosPadrao }>();
  const [excluir, setExcluir] = useState<PadraoIa>();
  const padroes = dados?.padroes;
  const nomes = new Set(padroes?.map((p) => p.nome));

  return (
    <>
      <PageHeader
        title="Biblioteca"
        description="Padrões são instruções que o escritório escreve uma vez e a IA segue sempre: no parecer, na análise de risco, na tabela, no assistente e nas outras tarefas marcadas."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setForm({})}>
            Novo padrão
          </Button>
        }
      />
      <AbasBiblioteca atual="padroes" />

      {erro ? (
        <Alert>{erro}</Alert>
      ) : !padroes ? (
        <Spinner />
      ) : !padroes.length ? (
        <Card className="mb-6">
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title="Nenhum padrão ainda"
            description="Comece por um dos modelos prontos abaixo e ajuste ao jeito do escritório, ou escreva o seu."
          />
        </Card>
      ) : (
        <ul className="mb-8 grid items-start gap-3 xl:grid-cols-2">
          {padroes.map((p) => (
            <li key={p.id}>
              <Card className={clsx(!p.ativo && "opacity-60")}>
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{p.nome}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        {p.escopo === "pessoal" ? <Lock className="h-3.5 w-3.5" aria-hidden /> : <Users className="h-3.5 w-3.5" aria-hidden />}
                        {p.escopo === "pessoal" ? "Só seu" : "Do escritório"} · {p.autorNome}
                        {!p.ativo && " · desligado"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" aria-label={`Editar ${p.nome}`} icon={<Pencil className="h-4 w-4" />} onClick={() => setForm({ padrao: p })} />
                      <Button size="sm" variant="ghost" className="text-red-600" aria-label={`Excluir ${p.nome}`} icon={<Trash2 className="h-4 w-4" />} onClick={() => setExcluir(p)} />
                    </div>
                  </div>
                  <p className="line-clamp-4 whitespace-pre-wrap text-sm text-slate-700">{p.instrucoes}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.usos.map((u: UsoPadrao) => (
                      <Badge key={u} className="bg-brand-50 text-brand-700">
                        {USO_PADRAO_LABEL[u]}
                      </Badge>
                    ))}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader title="Modelos prontos" subtitle="Adote e ajuste. O padrão fica do escritório e pode ser editado depois." />
        <ul className="divide-y divide-slate-100">
          {MODELOS_PADRAO.map((m) => (
            <li key={m.nome} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{m.nome}</p>
                <p className="text-xs text-slate-500">{m.descricao}</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={nomes.has(m.nome)}
                onClick={() => setForm({ inicial: { nome: m.nome, instrucoes: m.instrucoes, usos: m.usos, escopo: "escritorio", ativo: true } })}
              >
                {nomes.has(m.nome) ? "Já adotado" : "Usar este"}
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <FormPadrao aberto={!!form} padrao={form?.padrao} inicial={form?.inicial} onFechar={() => setForm(undefined)} onSalvo={() => void recarregar()} />
      <ConfirmDialog
        open={!!excluir}
        onClose={() => setExcluir(undefined)}
        title="Excluir padrão?"
        description={
          <>
            A IA deixa de seguir <strong>{excluir?.nome}</strong>. Para pausar sem apagar, edite e desligue.
          </>
        }
        onConfirm={async () => {
          if (!excluir) return;
          try {
            await api(`/api/padroes/${excluir.id}`, { method: "DELETE" });
            toast("Padrão excluído");
          } catch (e) {
            toast(mensagemDe(e), { tom: "error" });
          }
          void recarregar();
        }}
      />
    </>
  );
}
