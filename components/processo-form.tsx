"use client";

import { Save } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { ErroApi } from "@/lib/auth/api";
import { type DadosProcesso, type ErrosProcesso, formatarValor, lerValor, mascaraCNJ, POLO_CLIENTE_LABEL, type PoloCliente, type Processo, validarProcesso } from "@/lib/processos";
import { useStore } from "@/lib/store";
import { formatProcesso } from "@/lib/utils";
import { SeletorResponsavel } from "./equipe";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from "./ui";

/** Campos como o usuário digita (valor da causa em texto). */
interface Formulario {
  numero: string;
  cliente: string;
  parteContraria: string;
  polo: PoloCliente | "";
  tribunal: string;
  orgao: string;
  classe: string;
  valorCausa: string;
  responsavelId: string;
  observacoes: string;
}

export type ValoresIniciais = Partial<Omit<Formulario, "valorCausa">>;

function inicial(p?: Processo, iniciais?: ValoresIniciais): Formulario {
  return {
    numero: mascaraCNJ(p?.numero ?? iniciais?.numero ?? ""),
    cliente: p?.cliente ?? iniciais?.cliente ?? "",
    parteContraria: p?.parteContraria ?? iniciais?.parteContraria ?? "",
    polo: p?.polo ?? iniciais?.polo ?? "",
    tribunal: p?.tribunal ?? iniciais?.tribunal ?? "",
    orgao: p?.orgao ?? iniciais?.orgao ?? "",
    classe: p?.classe ?? iniciais?.classe ?? "",
    valorCausa: p?.valorCausa !== undefined ? formatarValor(p.valorCausa).replace(/^R\$\s?/, "") : "",
    responsavelId: p?.responsavelId ?? iniciais?.responsavelId ?? "",
    observacoes: p?.observacoes ?? "",
  };
}

/** Converte o formulário nos dados da API; devolve os erros quando há algum. */
function converter(f: Formulario): { dados: Partial<Record<keyof DadosProcesso, unknown>>; erros: ErrosProcesso } {
  const valor = lerValor(f.valorCausa);
  const dados = { ...f, polo: f.polo || undefined, valorCausa: valor ?? undefined };
  const erros = validarProcesso(dados);
  if (valor === null) erros.valorCausa = "Use o formato 1.234,56.";
  return { dados, erros };
}

interface Props {
  processo?: Processo;
  iniciais?: ValoresIniciais;
  /** Grava no servidor; erros da API voltam como ErroApi. */
  onSalvar: (dados: Partial<Record<keyof DadosProcesso, unknown>>) => Promise<void>;
  onCancelar: () => void;
}

export function ProcessoForm({ processo, iniciais, onSalvar, onCancelar }: Props) {
  const { termos, intimacoes, equipe } = useStore();
  const [f, setF] = useState<Formulario>(() => inicial(processo, iniciais));
  const [erros, setErros] = useState<ErrosProcesso>({});
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState("");
  const [duplicado, setDuplicado] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);

  const sugestoesCliente = useMemo(() => [...new Set([...termos.map((t) => t.apelido), ...intimacoes.map((i) => i.cliente)].filter(Boolean))], [termos, intimacoes]);

  function atualizar<K extends keyof Formulario>(k: K, v: Formulario[K]) {
    const novo = { ...f, [k]: v };
    setF(novo);
    if (k === "numero") setDuplicado(undefined);
    if (tentou) setErros(converter(novo).erros);
  }

  /** Leva o usuário até o primeiro campo com problema. */
  const irParaErro = () => requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid='true'], [role='alert']")?.scrollIntoView({ behavior: "smooth", block: "center" }));

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    setErroGeral("");
    const { dados, erros: errosAtuais } = converter(f);
    setErros(errosAtuais);
    if (Object.keys(errosAtuais).length) return irParaErro();
    setSalvando(true);
    try {
      await onSalvar(dados);
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === "conflito" && e.campo === "numero") {
        setErros({ numero: e.message });
        setDuplicado(typeof e.detalhes.id === "string" ? e.detalhes.id : undefined);
      } else if (e instanceof ErroApi && e.campo) {
        setErros({ [e.campo]: e.message });
      } else {
        setErroGeral(e instanceof Error ? e.message : "Não foi possível salvar.");
      }
      setSalvando(false);
      irParaErro();
    }
  }

  return (
    <form ref={formRef} onSubmit={submeter} noValidate className="space-y-6">
      {erroGeral && <Alert>{erroGeral}</Alert>}
      <Card>
        <CardHeader title="Identificação" />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Field label="Número do processo (CNJ)" htmlFor="numero" required error={erros.numero} className="sm:col-span-2">
            <Input
              id="numero"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0000000-00.0000.0.00.0000"
              value={f.numero}
              onChange={(e) => atualizar("numero", mascaraCNJ(e.target.value))}
              invalid={!!erros.numero}
              className="font-mono"
              autoFocus={!processo}
            />
            {duplicado && (
              <Link href={`/processos/${duplicado}`} className="mt-1 inline-block text-xs font-medium text-brand-700 hover:underline">
                Abrir o processo {formatProcesso(f.numero)}
              </Link>
            )}
          </Field>
          <Field label="Cliente" htmlFor="cliente" required error={erros.cliente}>
            <Input id="cliente" list="lista-clientes-processo" value={f.cliente} onChange={(e) => atualizar("cliente", e.target.value)} invalid={!!erros.cliente} />
            <datalist id="lista-clientes-processo">
              {sugestoesCliente.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Lado do cliente" htmlFor="polo" required error={erros.polo}>
            <Select id="polo" value={f.polo} onChange={(e) => atualizar("polo", e.target.value as PoloCliente | "")} invalid={!!erros.polo}>
              <option value="">Escolha…</option>
              {(Object.keys(POLO_CLIENTE_LABEL) as PoloCliente[]).map((p) => (
                <option key={p} value={p}>
                  {POLO_CLIENTE_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Parte contrária" htmlFor="parteContraria" error={erros.parteContraria} className="sm:col-span-2">
            <Input id="parteContraria" value={f.parteContraria} onChange={(e) => atualizar("parteContraria", e.target.value)} invalid={!!erros.parteContraria} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Juízo e causa" />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Field label="Tribunal" htmlFor="tribunal" hint="Sigla, como TJSP ou TRT2." error={erros.tribunal}>
            <Input id="tribunal" value={f.tribunal} onChange={(e) => atualizar("tribunal", e.target.value.toUpperCase())} invalid={!!erros.tribunal} />
          </Field>
          <Field label="Vara ou órgão julgador" htmlFor="orgao" error={erros.orgao}>
            <Input id="orgao" value={f.orgao} onChange={(e) => atualizar("orgao", e.target.value)} invalid={!!erros.orgao} />
          </Field>
          <Field label="Classe (tipo de ação)" htmlFor="classe" error={erros.classe}>
            <Input id="classe" value={f.classe} onChange={(e) => atualizar("classe", e.target.value)} invalid={!!erros.classe} />
          </Field>
          <Field label="Valor da causa (R$)" htmlFor="valorCausa" error={erros.valorCausa}>
            <Input id="valorCausa" inputMode="decimal" placeholder="0,00" value={f.valorCausa} onChange={(e) => atualizar("valorCausa", e.target.value)} invalid={!!erros.valorCausa} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Controle interno" />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Field label="Responsável" htmlFor="responsavelId" hint={equipe.length ? undefined : "Cadastre a equipe para escolher um responsável."}>
            <SeletorResponsavel id="responsavelId" value={f.responsavelId || undefined} onChange={(id) => atualizar("responsavelId", id ?? "")} />
          </Field>
          <Field label="Observações" htmlFor="observacoes" error={erros.observacoes} className="sm:col-span-2">
            <Textarea id="observacoes" rows={4} value={f.observacoes} onChange={(e) => atualizar("observacoes", e.target.value)} placeholder="Anotações do escritório…" invalid={!!erros.observacoes} />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" loading={salvando} icon={<Save className="h-4 w-4" />}>
          {processo ? "Salvar alterações" : "Cadastrar processo"}
        </Button>
      </div>
    </form>
  );
}
