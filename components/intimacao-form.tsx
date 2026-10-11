"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import type { Intimacao } from "@/lib/types";
import { hojeISO, MEIOS, STATUS_LABEL, STATUS_ORDER, TIPOS_COMUNICACAO_PADRAO, UFS } from "@/lib/utils";
import { validarIntimacao, type DadosFormulario, type ErrosFormulario } from "@/lib/validacao";
import { useStore } from "@/lib/store";
import { DatePicker } from "./date-picker";
import { EditorPrazo } from "./prazo";
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from "./ui";

function inicial(i?: Intimacao): DadosFormulario {
  return {
    cliente: i?.cliente ?? "",
    tribunal: i?.tribunal ?? "",
    orgao: i?.orgao ?? "",
    dataDisponibilizacao: i?.dataDisponibilizacao ?? hojeISO(),
    tipoComunicacao: i?.tipoComunicacao ?? "Intimação",
    meio: i?.meio ?? "D",
    tipoDocumento: i?.tipoDocumento ?? "",
    classe: i?.classe ?? "",
    numeroProcesso: i?.numeroProcesso ?? "",
    partes: i?.partes.length ? i.partes : [{ nome: "", polo: "A" }],
    advogados: i?.advogados.length ? i.advogados : [{ nome: "", oab: "", uf: "" }],
    texto: i?.texto ?? "",
    link: i?.link ?? "",
    status: i?.status ?? "nova",
    prazo: i?.prazo ?? "",
    regraPrazo: i ? (i.regraPrazo ?? null) : null,
    observacoes: i?.observacoes ?? "",
  };
}

/** Máscara do número CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO */
function mascaraCNJ(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 20);
  const partes = [d.slice(0, 7), d.slice(7, 9), d.slice(9, 13), d.slice(13, 14), d.slice(14, 16), d.slice(16, 20)];
  let out = partes[0];
  if (partes[1]) out += "-" + partes[1];
  for (const p of partes.slice(2)) if (p) out += "." + p;
  return out;
}

interface Props {
  intimacao?: Intimacao;
  onSalvar: (dados: DadosFormulario) => void;
  onCancelar: () => void;
}

export function IntimacaoForm({ intimacao, onSalvar, onCancelar }: Props) {
  const { termos, intimacoes } = useStore();
  const [dados, setDados] = useState<DadosFormulario>(() => inicial(intimacao));
  const [erros, setErros] = useState<ErrosFormulario>({});
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const sugestoesCliente = useMemo(
    () => [...new Set([...termos.map((t) => t.apelido), ...intimacoes.map((i) => i.cliente)].filter(Boolean))],
    [termos, intimacoes],
  );

  function atualizar<K extends keyof DadosFormulario>(k: K, v: DadosFormulario[K]) {
    const novo = { ...dados, [k]: v };
    setDados(novo);
    // Depois da primeira tentativa, revalida a cada alteração para dar feedback imediato.
    if (tentou) setErros(validarIntimacao(novo, hojeISO()));
  }

  function submeter(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    const errosAtuais = validarIntimacao(dados, hojeISO());
    setErros(errosAtuais);
    if (Object.keys(errosAtuais).length) {
      // Leva o usuário até o primeiro campo com problema.
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid='true'], [role='alert']")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    setSalvando(true);
    onSalvar({
      ...dados,
      partes: dados.partes.filter((p) => p.nome.trim()),
      advogados: dados.advogados.filter((a) => a.nome.trim()),
      // Salvar o formulário confirma os dias lidos no texto.
      regraPrazo: dados.regraPrazo ? { ...dados.regraPrazo, fonte: "usuario" } : null,
    });
  }

  const qtdErros = Object.keys(erros).length;

  return (
    <form ref={formRef} onSubmit={submeter} noValidate className="space-y-6">
      {tentou && qtdErros > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          Corrija {qtdErros === 1 ? "o campo destacado" : `os ${qtdErros} campos destacados`} antes de salvar.
        </div>
      )}

      <Card>
        <CardHeader title="Dados da comunicação" subtitle="Órgão, data de disponibilização, tipo e meio" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Cliente" htmlFor="cliente" required error={erros.cliente} hint="Vincula a intimação à sua carteira">
            <Input id="cliente" list="lista-clientes" value={dados.cliente} onChange={(e) => atualizar("cliente", e.target.value)} invalid={!!erros.cliente} />
            <datalist id="lista-clientes">
              {sugestoesCliente.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Número do processo (CNJ)" htmlFor="processo" required error={erros.numeroProcesso}>
            <Input
              id="processo"
              inputMode="numeric"
              placeholder="0000000-00.0000.0.00.0000"
              value={dados.numeroProcesso}
              onChange={(e) => atualizar("numeroProcesso", mascaraCNJ(e.target.value))}
              invalid={!!erros.numeroProcesso}
              className="font-mono"
            />
          </Field>
          <Field label="Data de disponibilização" htmlFor="data" required error={erros.dataDisponibilizacao}>
            <DatePicker id="data" value={dados.dataDisponibilizacao} onChange={(v) => atualizar("dataDisponibilizacao", v)} max={hojeISO()} invalid={!!erros.dataDisponibilizacao} clearable={false} />
          </Field>
          <Field label="Tribunal (sigla)" htmlFor="tribunal" required error={erros.tribunal}>
            <Input id="tribunal" placeholder="TJSP" value={dados.tribunal} onChange={(e) => atualizar("tribunal", e.target.value.toUpperCase())} invalid={!!erros.tribunal} />
          </Field>
          <Field label="Órgão" htmlFor="orgao" required error={erros.orgao} className="lg:col-span-2">
            <Input id="orgao" placeholder="Ex.: 5ª Vara Cível do Foro Central" value={dados.orgao} onChange={(e) => atualizar("orgao", e.target.value)} invalid={!!erros.orgao} />
          </Field>
          <Field label="Tipo de comunicação" htmlFor="tipo" required error={erros.tipoComunicacao}>
            <Select id="tipo" value={dados.tipoComunicacao} onChange={(e) => atualizar("tipoComunicacao", e.target.value)} invalid={!!erros.tipoComunicacao}>
              {[...new Set([...TIPOS_COMUNICACAO_PADRAO, dados.tipoComunicacao])].filter(Boolean).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Meio" htmlFor="meio" required error={erros.meio}>
            <Select id="meio" value={dados.meio} onChange={(e) => atualizar("meio", e.target.value)} invalid={!!erros.meio}>
              {MEIOS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
              {!MEIOS.some((m) => m.value === dados.meio) && dados.meio && <option value={dados.meio}>{dados.meio}</option>}
            </Select>
          </Field>
          <Field label="Tipo de documento" htmlFor="tipoDoc">
            <Input id="tipoDoc" placeholder="Despacho, Decisão, Sentença…" value={dados.tipoDocumento} onChange={(e) => atualizar("tipoDocumento", e.target.value)} />
          </Field>
          <Field label="Classe (tipo de ação)" htmlFor="classe" className="sm:col-span-2 lg:col-span-3">
            <Input id="classe" placeholder="Ex.: Procedimento Comum Cível" value={dados.classe} onChange={(e) => atualizar("classe", e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Partes"
            action={
              <Button type="button" size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => atualizar("partes", [...dados.partes, { nome: "", polo: "P" }])}>
                Adicionar
              </Button>
            }
          />
          <div className="space-y-3 p-5">
            {dados.partes.map((p, idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  placeholder="Nome da parte"
                  value={p.nome}
                  onChange={(e) => atualizar("partes", dados.partes.map((x, i) => (i === idx ? { ...x, nome: e.target.value } : x)))}
                  invalid={!!erros.partes && !p.nome.trim()}
                  className="min-w-0 flex-1"
                  aria-label={`Nome da parte ${idx + 1}`}
                />
                <Select
                  value={p.polo}
                  onChange={(e) => atualizar("partes", dados.partes.map((x, i) => (i === idx ? { ...x, polo: e.target.value } : x)))}
                  className="w-32 shrink-0"
                  aria-label="Polo"
                >
                  <option value="A">Ativo</option>
                  <option value="P">Passivo</option>
                  <option value="">Outro</option>
                </Select>
                <button
                  type="button"
                  disabled={dados.partes.length === 1}
                  onClick={() => atualizar("partes", dados.partes.filter((_, i) => i !== idx))}
                  className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  aria-label="Remover parte"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {erros.partes && (
              <p className="text-xs text-red-600" role="alert">
                {erros.partes}
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Advogados"
            action={
              <Button type="button" size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => atualizar("advogados", [...dados.advogados, { nome: "", oab: "", uf: "" }])}>
                Adicionar
              </Button>
            }
          />
          <div className="space-y-3 p-5">
            {dados.advogados.map((a, idx) => {
              const erro = erros[`advogados.${idx}`];
              const mudar = (campo: "nome" | "oab" | "uf", v: string) => atualizar("advogados", dados.advogados.map((x, i) => (i === idx ? { ...x, [campo]: v } : x)));
              return (
                <div key={idx}>
                  <div className="flex gap-2">
                    <Input placeholder="Nome do advogado" value={a.nome} onChange={(e) => mudar("nome", e.target.value)} invalid={!!erro} className="min-w-0 flex-1" aria-label={`Nome do advogado ${idx + 1}`} />
                    <Input placeholder="OAB" value={a.oab} onChange={(e) => mudar("oab", e.target.value)} className="w-24 shrink-0" invalid={!!erro} aria-label="Número OAB" />
                    <Select value={a.uf} onChange={(e) => mudar("uf", e.target.value)} className="w-20 shrink-0" aria-label="UF da OAB">
                      <option value="">UF</option>
                      {UFS.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={() => atualizar("advogados", dados.advogados.length === 1 ? [{ nome: "", oab: "", uf: "" }] : dados.advogados.filter((_, i) => i !== idx))}
                      className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Remover advogado"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {erro && (
                    <p className="mt-1 text-xs text-red-600" role="alert">
                      {erro}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Inteiro teor" subtitle="Texto completo da intimação" />
        <div className="space-y-4 p-5">
          <Field label="Texto da intimação" htmlFor="texto" required error={erros.texto} hint={`${dados.texto.length} caracteres`}>
            <Textarea id="texto" rows={8} value={dados.texto} onChange={(e) => atualizar("texto", e.target.value)} invalid={!!erros.texto} />
          </Field>
          <Field label="Link para o documento" htmlFor="link" error={erros.link}>
            <Input id="link" type="url" placeholder="https://…" value={dados.link} onChange={(e) => atualizar("link", e.target.value)} invalid={!!erros.link} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Controle interno" subtitle="Status, prazo e anotações do escritório" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Status" htmlFor="status">
            <Select id="status" value={dados.status} onChange={(e) => atualizar("status", e.target.value as DadosFormulario["status"])}>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <p className="mb-1.5 block text-sm font-medium text-slate-700">Prazo</p>
            <EditorPrazo
              base={dados}
              prazo={dados.prazo}
              regra={dados.regraPrazo ?? null}
              erro={erros.prazo}
              onChange={(prazo, regraPrazo) => {
                const novo = { ...dados, prazo, regraPrazo };
                setDados(novo);
                if (tentou) setErros(validarIntimacao(novo, hojeISO()));
              }}
            />
          </div>
          <Field label="Observações" htmlFor="obs" className="sm:col-span-2 lg:col-span-3">
            <Textarea id="obs" rows={3} value={dados.observacoes} onChange={(e) => atualizar("observacoes", e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-slate-200 bg-slate-50/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button type="button" variant="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" loading={salvando} icon={<Save className="h-4 w-4" />}>
          {intimacao ? "Salvar alterações" : "Cadastrar intimação"}
        </Button>
      </div>
    </form>
  );
}
