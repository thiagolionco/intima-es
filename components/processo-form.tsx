"use client";

import clsx from "clsx";
import { Lock, Save } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { ErroApi } from "@/lib/auth/api";
import {
  AREA_LABEL,
  type AreaAtuacao,
  type DadosProcesso,
  diasParaPrescrever,
  type ErrosProcesso,
  FASES,
  type FaseProcesso,
  formatarValor,
  lerValor,
  mascaraCNJ,
  POLO_CLIENTE_LABEL,
  type PoloCliente,
  type Processo,
  textoPrescricao,
  TIPO_DEMANDA_LABEL,
  type TipoDemanda,
  validarProcesso,
} from "@/lib/processos";
import { pode } from "@/lib/escritorio";
import { indiceEtapa } from "@/lib/fluxo/etapas";
import { LIMITES_FLUXO } from "@/lib/fluxo/modelo";
import { mensagemDeBloqueio } from "@/lib/use-fluxo";
import { useStore } from "@/lib/store";
import { formatProcesso, hojeISO } from "@/lib/utils";
import { DatePicker } from "./date-picker";
import { SeletorResponsavel } from "./equipe";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from "./ui";

/** Campos como o usuário digita (valor da causa em texto). */
interface Formulario {
  fase: FaseProcesso;
  area: AreaAtuacao | "";
  tipo: TipoDemanda | "";
  dataAtendimento: string;
  dataInicio: string;
  prescricao: string;
  dataProtocolo: string;
  comarca: string;
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
  particular: boolean;
}

export type ValoresIniciais = Partial<Omit<Formulario, "valorCausa">>;

function inicial(p?: Processo, iniciais?: ValoresIniciais): Formulario {
  const numero = p?.numero ?? iniciais?.numero ?? "";
  const fase = p?.fase ?? iniciais?.fase ?? (numero ? "protocolado" : "triagem");
  return {
    fase,
    area: p?.area ?? iniciais?.area ?? "",
    tipo: p?.tipo ?? iniciais?.tipo ?? "",
    // Caso novo em preparação: o atendimento normalmente é hoje.
    dataAtendimento: p?.dataAtendimento ?? (p || fase === "protocolado" ? "" : hojeISO()),
    dataInicio: p?.dataInicio ?? "",
    prescricao: p?.prescricao ?? "",
    dataProtocolo: p?.dataProtocolo ?? "",
    comarca: p?.comarca ?? iniciais?.comarca ?? "",
    numero: mascaraCNJ(numero),
    cliente: p?.cliente ?? iniciais?.cliente ?? "",
    parteContraria: p?.parteContraria ?? iniciais?.parteContraria ?? "",
    polo: p?.polo ?? iniciais?.polo ?? "",
    tribunal: p?.tribunal ?? iniciais?.tribunal ?? "",
    orgao: p?.orgao ?? iniciais?.orgao ?? "",
    classe: p?.classe ?? iniciais?.classe ?? "",
    valorCausa: p?.valorCausa !== undefined ? formatarValor(p.valorCausa).replace(/^R\$\s?/, "") : "",
    responsavelId: p?.responsavelId ?? iniciais?.responsavelId ?? "",
    observacoes: p?.observacoes ?? "",
    particular: !!p?.particular,
  };
}

/** Converte o formulário nos dados da API; devolve os erros quando há algum. */
function converter(f: Formulario): { dados: Partial<Record<keyof DadosProcesso, unknown>>; erros: ErrosProcesso } {
  const valor = lerValor(f.valorCausa);
  const dados = { ...f, polo: f.polo || undefined, area: f.area || undefined, tipo: f.tipo || undefined, valorCausa: valor ?? undefined };
  const erros = validarProcesso(dados);
  if (valor === null) erros.valorCausa = "Use o formato 1.234,56.";
  return { dados, erros };
}

interface Props {
  processo?: Processo;
  iniciais?: ValoresIniciais;
  /** Grava no servidor; erros da API voltam como ErroApi. */
  onSalvar: (dados: Partial<Record<keyof DadosProcesso | "motivo", unknown>>) => Promise<void>;
  onCancelar: () => void;
}

export function ProcessoForm({ processo, iniciais, onSalvar, onCancelar }: Props) {
  const { termos, intimacoes, equipe, papel } = useStore();
  // Tirar da vista do escritório um processo que já é dele é decisão do dono (o servidor confere).
  const travaParticular = !!processo && !processo.particular && !pode(papel ?? "dono", "tornar_particular");
  const [f, setF] = useState<Formulario>(() => inicial(processo, iniciais));
  const [erros, setErros] = useState<ErrosProcesso>({});
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState("");
  const [duplicado, setDuplicado] = useState<string>();
  /** Voltar de etapa num processo que já existe pede motivo, como na Central de casos. */
  const [motivo, setMotivo] = useState("");
  const volta = !!processo && indiceEtapa(f.fase) < indiceEtapa(processo.fase);
  const erroMotivo = tentou && volta && motivo.trim().length < LIMITES_FLUXO.motivoMinimo ? `Diga por que o caso volta (mínimo de ${LIMITES_FLUXO.motivoMinimo} caracteres).` : undefined;
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
    if (Object.keys(errosAtuais).length || (volta && motivo.trim().length < LIMITES_FLUXO.motivoMinimo)) return irParaErro();
    setSalvando(true);
    try {
      await onSalvar(volta ? { ...dados, motivo: motivo.trim() } : dados);
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === "conflito" && e.campo === "numero") {
        setErros({ numero: e.message });
        setDuplicado(typeof e.detalhes.id === "string" ? e.detalhes.id : undefined);
      } else if (e instanceof ErroApi && e.campo) {
        setErros({ [e.campo]: e.message });
      } else {
        setErroGeral(mensagemDeBloqueio(e));
      }
      setSalvando(false);
      irParaErro();
    }
  }

  const protocolado = f.fase === "protocolado";
  const dias = diasParaPrescrever(f.prescricao, hojeISO());

  return (
    <form ref={formRef} onSubmit={submeter} noValidate className="space-y-6">
      {erroGeral && <Alert>{erroGeral}</Alert>}
      <Card>
        <CardHeader title="Caso" />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Field label="Cliente" htmlFor="cliente" required error={erros.cliente}>
            <Input id="cliente" list="lista-clientes-processo" value={f.cliente} onChange={(e) => atualizar("cliente", e.target.value)} invalid={!!erros.cliente} autoFocus={!processo} />
            <datalist id="lista-clientes-processo">
              {sugestoesCliente.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Parte contrária" htmlFor="parteContraria" error={erros.parteContraria}>
            <Input id="parteContraria" value={f.parteContraria} onChange={(e) => atualizar("parteContraria", e.target.value)} invalid={!!erros.parteContraria} />
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
          <Field label="Área de atuação" htmlFor="area" error={erros.area}>
            <Select id="area" value={f.area} onChange={(e) => atualizar("area", e.target.value as AreaAtuacao | "")} invalid={!!erros.area}>
              <option value="">Escolha…</option>
              {(Object.keys(AREA_LABEL) as AreaAtuacao[]).map((a) => (
                <option key={a} value={a}>
                  {AREA_LABEL[a]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo" htmlFor="tipo" error={erros.tipo}>
            <Select
              id="tipo"
              value={f.tipo}
              onChange={(e) => {
                const tipo = e.target.value as TipoDemanda | "";
                // Defesa quase sempre é com o cliente no polo passivo.
                setF((atual) => ({ ...atual, tipo, polo: tipo === "defesa" && !atual.polo ? "passivo" : atual.polo }));
              }}
              invalid={!!erros.tipo}
            >
              <option value="">Escolha…</option>
              {(Object.keys(TIPO_DEMANDA_LABEL) as TipoDemanda[]).map((t) => (
                <option key={t} value={t}>
                  {TIPO_DEMANDA_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fase" htmlFor="fase" required error={erros.fase}>
            <Select id="fase" value={f.fase} onChange={(e) => atualizar("fase", e.target.value as FaseProcesso)} invalid={!!erros.fase}>
              {FASES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.rotulo}
                </option>
              ))}
            </Select>
          </Field>
          {volta && (
            <Field label="Motivo da volta" htmlFor="motivo" required error={erroMotivo} hint="Fica no histórico do caso." className="sm:col-span-2">
              <Textarea id="motivo" rows={2} maxLength={LIMITES_FLUXO.motivo} value={motivo} onChange={(e) => setMotivo(e.target.value)} invalid={!!erroMotivo} placeholder="Ex.: faltou o pedido de tutela de urgência." />
            </Field>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Datas e prazos" />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Field label="Data do atendimento" htmlFor="dataAtendimento" error={erros.dataAtendimento}>
            <DatePicker id="dataAtendimento" value={f.dataAtendimento} onChange={(v) => atualizar("dataAtendimento", v)} invalid={!!erros.dataAtendimento} />
          </Field>
          <Field label="Início dos trabalhos" htmlFor="dataInicio" error={erros.dataInicio}>
            <DatePicker id="dataInicio" value={f.dataInicio} onChange={(v) => atualizar("dataInicio", v)} invalid={!!erros.dataInicio} />
          </Field>
          <Field label="Prescrição" htmlFor="prescricao" error={erros.prescricao} hint={dias !== undefined ? textoPrescricao(dias) : "Data em que o direito prescreve."}>
            <DatePicker id="prescricao" value={f.prescricao} onChange={(v) => atualizar("prescricao", v)} invalid={!!erros.prescricao} />
          </Field>
          <Field label="Responsável" htmlFor="responsavelId" hint={equipe.length ? undefined : "Cadastre a equipe para escolher um responsável."}>
            <SeletorResponsavel id="responsavelId" value={f.responsavelId || undefined} onChange={(id) => atualizar("responsavelId", id ?? "")} />
          </Field>
          <label className={clsx("flex items-start gap-3 rounded-lg border p-3 sm:col-span-2", f.particular ? "border-amber-300 bg-amber-50" : "border-slate-200", travaParticular && "opacity-60")}>
            <input
              type="checkbox"
              checked={f.particular}
              disabled={travaParticular}
              onChange={(e) => atualizar("particular", e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            <span className="text-sm">
              <span className="flex items-center gap-1.5 font-medium text-slate-800">
                <Lock className="h-3.5 w-3.5" aria-hidden /> Processo particular
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {travaParticular
                  ? "Só o dono do escritório pode tornar particular um processo que já é do escritório."
                  : "Só você vê este processo, os PDFs, pareceres e andamentos dele. O resto do escritório não fica sabendo que ele existe. As intimações que chegam pelo Comunica continuam na lista do escritório."}
              </span>
            </span>
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader title="Processo" subtitle={protocolado ? undefined : "Preencha quando protocolar."} />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Field label="Número do processo (CNJ)" htmlFor="numero" required={protocolado} error={erros.numero}>
            <Input
              id="numero"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0000000-00.0000.0.00.0000"
              value={f.numero}
              onChange={(e) => atualizar("numero", mascaraCNJ(e.target.value))}
              invalid={!!erros.numero}
              className="font-mono"
            />
            {duplicado && (
              <Link href={`/processos/${duplicado}`} className="mt-1 inline-block text-xs font-medium text-brand-700 hover:underline">
                Abrir o processo {formatProcesso(f.numero)}
              </Link>
            )}
          </Field>
          <Field label="Data do protocolo" htmlFor="dataProtocolo" error={erros.dataProtocolo}>
            <DatePicker id="dataProtocolo" value={f.dataProtocolo} onChange={(v) => atualizar("dataProtocolo", v)} invalid={!!erros.dataProtocolo} />
          </Field>
          <Field label="Tribunal" htmlFor="tribunal" hint="Sigla, como TJSP ou TRT2." error={erros.tribunal}>
            <Input id="tribunal" value={f.tribunal} onChange={(e) => atualizar("tribunal", e.target.value.toUpperCase())} invalid={!!erros.tribunal} />
          </Field>
          <Field label="Comarca" htmlFor="comarca" error={erros.comarca}>
            <Input id="comarca" value={f.comarca} onChange={(e) => atualizar("comarca", e.target.value)} invalid={!!erros.comarca} />
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
        <CardHeader title="Observações" />
        <div className="p-5">
          <Textarea id="observacoes" aria-label="Observações" rows={4} value={f.observacoes} onChange={(e) => atualizar("observacoes", e.target.value)} placeholder="Anotações do escritório…" invalid={!!erros.observacoes} />
          {erros.observacoes && (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {erros.observacoes}
            </p>
          )}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" loading={salvando} icon={<Save className="h-4 w-4" />}>
          {processo ? "Salvar alterações" : "Cadastrar"}
        </Button>
      </div>
    </form>
  );
}
