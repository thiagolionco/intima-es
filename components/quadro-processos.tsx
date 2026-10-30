"use client";

import clsx from "clsx";
import { Hourglass, Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api, ErroApi } from "@/lib/auth/api";
import { alertaPrescricao, diasParaPrescrever, type FaseProcesso, mascaraCNJ, type Processo, textoPrescricao, validarProcesso } from "@/lib/processos";
import { hojeISO } from "@/lib/utils";
import { mensagemDeBloqueio } from "@/lib/use-fluxo";
import { DatePicker } from "./date-picker";
import { Modal } from "./modal";
import { Button, Field, Input } from "./ui";

const ESTILO_PRESCRICAO = {
  vencida: "bg-red-100 text-red-800",
  urgente: "bg-red-50 text-red-700",
  atencao: "bg-amber-50 text-amber-800",
  ok: "bg-slate-100 text-slate-600",
} as const;

/** Quantos dias faltam para prescrever, com cor pela urgência. Nada quando não há data. */
export function SeloPrescricao({ prescricao, className }: { prescricao?: string; className?: string }) {
  const dias = diasParaPrescrever(prescricao, hojeISO());
  const alerta = alertaPrescricao(dias);
  if (dias === undefined || !alerta) return null;
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium", ESTILO_PRESCRICAO[alerta], className)}>
      <Hourglass className="h-3 w-3" aria-hidden />
      {textoPrescricao(dias)}
    </span>
  );
}

/** Processo que só quem o marcou enxerga. */
export function SeloParticular({ particular, className }: { particular?: boolean; className?: string }) {
  if (!particular) return null;
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800", className)} title="Só você vê este processo">
      <Lock className="h-3 w-3" aria-hidden />
      Particular
    </span>
  );
}

/** As abas da área de processos. */
export function AbasProcessos({ atual, contagem }: { atual: "andamento" | "protocolados" | "central" | "revisao"; contagem?: { andamento: number; protocolados: number } }) {
  const abas = [
    { id: "andamento", rotulo: "Em preparação", href: "/processos", n: contagem?.andamento },
    { id: "protocolados", rotulo: "Protocolados", href: "/processos/protocolados", n: contagem?.protocolados },
    { id: "central", rotulo: "Central de casos", href: "/processos/central", n: undefined, previa: true },
    { id: "revisao", rotulo: "Revisão em tabela", href: "/processos/revisao", n: undefined },
  ] as const;
  return (
    <nav className="mb-6 border-b border-slate-200" aria-label="Processos">
      <div className="-mb-px flex gap-6 overflow-x-auto">
        {abas.map((a) => (
          <Link
            key={a.id}
            href={a.href}
            aria-current={atual === a.id ? "page" : undefined}
            className={clsx(
              "whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition",
              atual === a.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
            )}
          >
            {a.rotulo}
            {a.n !== undefined && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{a.n}</span>}
            {"previa" in a && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">prévia</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/**
 * Grava a nova fase (e o que mais vier junto) mandando o processo inteiro, como a edição faz.
 * O servidor confere as regras da Central de casos; voltar de etapa precisa de `motivo`.
 */
export async function moverProcesso(p: Processo, fase: FaseProcesso, extras: Partial<Processo> & { motivo?: string } = {}): Promise<Processo> {
  const { processo } = await api<{ processo: Processo }>(`/api/processos/${p.id}`, { method: "PUT", body: { ...p, ...extras, fase } });
  return processo;
}

/** Ao protocolar, pede o número e a data do protocolo. */
export function ModalProtocolo({ processo, onFechar, onProtocolado }: { processo?: Processo; onFechar: () => void; onProtocolado: (p: Processo) => void }) {
  return processo ? <FormProtocolo key={processo.id} processo={processo} onFechar={onFechar} onProtocolado={onProtocolado} /> : null;
}

function FormProtocolo({ processo, onFechar, onProtocolado }: { processo: Processo; onFechar: () => void; onProtocolado: (p: Processo) => void }) {
  const [numero, setNumero] = useState(mascaraCNJ(processo.numero ?? ""));
  const [data, setData] = useState(processo.dataProtocolo ?? hojeISO());
  const [orgao, setOrgao] = useState(processo.orgao ?? "");
  const [comarca, setComarca] = useState(processo.comarca ?? "");
  const [erro, setErro] = useState<{ campo?: string; mensagem: string }>();
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    const extras = { numero, dataProtocolo: data || undefined, orgao, comarca };
    const erros = validarProcesso({ ...processo, ...extras, fase: "protocolado" });
    const [campo] = Object.keys(erros) as (keyof typeof erros)[];
    if (campo) return setErro({ campo, mensagem: erros[campo]! });
    setSalvando(true);
    try {
      onProtocolado(await moverProcesso(processo, "protocolado", extras));
    } catch (e) {
      setErro({ campo: e instanceof ErroApi ? e.campo : undefined, mensagem: mensagemDeBloqueio(e) });
      setSalvando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onFechar}
      title="Marcar como protocolado"
      footer={
        <>
          <Button variant="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button loading={salvando} onClick={confirmar}>
            Protocolar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Número do processo (CNJ)" htmlFor="protocolo-numero" required error={erro?.campo === "numero" ? erro.mensagem : undefined} className="sm:col-span-2">
          <Input id="protocolo-numero" inputMode="numeric" autoComplete="off" autoFocus placeholder="0000000-00.0000.0.00.0000" className="font-mono" value={numero} onChange={(e) => setNumero(mascaraCNJ(e.target.value))} invalid={erro?.campo === "numero"} />
        </Field>
        <Field label="Data do protocolo" htmlFor="protocolo-data" error={erro?.campo === "dataProtocolo" ? erro.mensagem : undefined}>
          <DatePicker id="protocolo-data" value={data} onChange={setData} />
        </Field>
        <Field label="Comarca" htmlFor="protocolo-comarca">
          <Input id="protocolo-comarca" value={comarca} onChange={(e) => setComarca(e.target.value)} />
        </Field>
        <Field label="Vara ou órgão julgador" htmlFor="protocolo-orgao" className="sm:col-span-2">
          <Input id="protocolo-orgao" value={orgao} onChange={(e) => setOrgao(e.target.value)} />
        </Field>
      </div>
      {erro && !["numero", "dataProtocolo"].includes(erro.campo ?? "") && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {erro.mensagem}
        </p>
      )}
    </Modal>
  );
}
