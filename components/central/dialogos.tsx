"use client";

import clsx from "clsx";
import { Check, CircleAlert } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/modal";
import { SeletorResponsavel } from "@/components/equipe";
import { Button, Field, Select, Textarea } from "@/components/ui";
import type { LinhaCaso } from "@/lib/fluxo/consulta";
import { ETAPAS, etapa, etapaAnterior, indiceEtapa } from "@/lib/fluxo/etapas";
import { LIMITES_FLUXO } from "@/lib/fluxo/modelo";
import type { Avaliacao } from "@/lib/fluxo/motor";
import type { FaseProcesso } from "@/lib/processos";
import type { ResultadoLote } from "@/lib/use-fluxo";

/** Voltar de etapa: escolhe para onde e diz por quê (vai para a trilha de auditoria). */
export function DialogoRetorno({ linha, onFechar, onConfirmar }: { linha?: LinhaCaso; onFechar: () => void; onConfirmar: (para: FaseProcesso, motivo: string) => Promise<void> }) {
  if (!linha) return null;
  return <FormRetorno key={linha.processo.id} linha={linha} onFechar={onFechar} onConfirmar={onConfirmar} />;
}

function FormRetorno({ linha, onFechar, onConfirmar }: { linha: LinhaCaso; onFechar: () => void; onConfirmar: (para: FaseProcesso, motivo: string) => Promise<void> }) {
  const atual = linha.processo.fase;
  const opcoes = ETAPAS.filter((e) => indiceEtapa(e.id) < indiceEtapa(atual));
  const [para, setPara] = useState<FaseProcesso>(etapaAnterior(atual) ?? "triagem");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const curto = motivo.trim().length < LIMITES_FLUXO.motivoMinimo;

  async function confirmar() {
    setSalvando(true);
    try {
      await onConfirmar(para, motivo.trim());
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onFechar}
      title="Voltar de etapa"
      footer={
        <>
          <Button variant="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={confirmar} loading={salvando} disabled={curto}>
            Voltar para {etapa(para).rotulo}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        <b className="font-medium text-slate-900">{linha.referencia}</b> sai de {etapa(atual).rotulo}. O checklist já marcado continua guardado.
      </p>
      <div className="space-y-4">
        {opcoes.length > 1 && (
          <Field label="Voltar para" htmlFor="retorno-para">
            <Select id="retorno-para" value={para} onChange={(e) => setPara(e.target.value as FaseProcesso)}>
              {opcoes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.rotulo}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Motivo" htmlFor="retorno-motivo" required hint={`Fica no histórico do caso. Mínimo de ${LIMITES_FLUXO.motivoMinimo} caracteres.`}>
          <Textarea id="retorno-motivo" autoFocus rows={3} maxLength={LIMITES_FLUXO.motivo} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: faltou o pedido de tutela de urgência." />
        </Field>
      </div>
    </Modal>
  );
}

export interface PreviaLote {
  linha: LinhaCaso;
  avaliacao?: Avaliacao & { para: FaseProcesso };
}

/**
 * Avançar vários casos: primeiro mostra o que a tela já sabe (portões de cada um), depois
 * o que o servidor respondeu. Quem não passa fica onde está, com o motivo.
 */
export function DialogoAvancoLote({
  previa,
  resultados,
  onFechar,
  onConfirmar,
  onAbrir,
}: {
  previa?: PreviaLote[];
  resultados?: ResultadoLote[];
  onFechar: () => void;
  onConfirmar: (ids: string[]) => Promise<void>;
  onAbrir: (id: string) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  if (!previa) return null;
  const prontos = previa.filter((x) => x.avaliacao?.permitido);
  const porId = new Map(resultados?.map((r) => [r.id, r]));
  const feito = Boolean(resultados);
  const passaram = resultados?.filter((r) => r.ok).length ?? 0;

  return (
    <Modal
      open
      onClose={onFechar}
      title={feito ? `${passaram} de ${previa.length} avançaram` : `Avançar ${previa.length} caso${previa.length > 1 ? "s" : ""}`}
      footer={
        feito ? (
          <Button onClick={onFechar}>Fechar</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onFechar}>
              Cancelar
            </Button>
            <Button
              loading={enviando}
              disabled={!prontos.length}
              onClick={async () => {
                setEnviando(true);
                try {
                  await onConfirmar(prontos.map((x) => x.linha.processo.id));
                } finally {
                  setEnviando(false);
                }
              }}
            >
              Avançar {prontos.length} caso{prontos.length === 1 ? "" : "s"}
            </Button>
          </>
        )
      }
    >
      <p className="mb-3 text-sm text-slate-500">{feito ? "O servidor conferiu cada caso de novo antes de gravar." : "A Central conferiu os portões de cada caso antes de mover."}</p>
      <ul className="max-h-[55vh] space-y-2 overflow-y-auto">
        {previa.map(({ linha, avaliacao }) => {
          const r = porId.get(linha.processo.id);
          const ok = feito ? Boolean(r?.ok) : Boolean(avaliacao?.permitido);
          const daTela = avaliacao?.bloqueios.map((b) => b.mensagem) ?? ["Já está na última etapa."];
          // Quem não foi enviado continua com as pendências que a tela já tinha mostrado.
          const motivos = feito && r ? (r.bloqueios ?? (r.mensagem ? [r.mensagem] : [])) : daTela;
          return (
            <li key={linha.processo.id} className={clsx("rounded-lg border p-3 text-sm", ok ? "border-emerald-200 bg-emerald-50/60" : "border-red-200 bg-red-50/60")}>
              <p className="flex items-center gap-2 font-medium text-slate-900">
                {ok ? <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : <CircleAlert className="h-4 w-4 shrink-0 text-red-600" aria-hidden />}
                <span className="truncate">{linha.referencia}</span>
              </p>
              {ok && avaliacao ? (
                <p className="ml-6 mt-0.5 text-emerald-800">
                  {etapa(linha.processo.fase).rotulo} → {etapa(avaliacao.para).rotulo}
                </p>
              ) : (
                <>
                  <p className="ml-6 mt-0.5 text-red-800">Fica em {etapa(linha.processo.fase).rotulo}:</p>
                  <ul className="ml-6 mt-0.5 list-disc pl-4 text-red-800">
                    {motivos.slice(0, 6).map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                  <button type="button" className="ml-6 mt-1 text-xs font-medium text-red-700 underline" onClick={() => onAbrir(linha.processo.id)}>
                    Abrir a ficha para resolver
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

/** Atribuir os selecionados a uma pessoa da equipe (ou tirar o responsável). */
export function DialogoAtribuir({ quantos, aberto, onFechar, onConfirmar }: { quantos: number; aberto: boolean; onFechar: () => void; onConfirmar: (id: string | null) => Promise<void> }) {
  const [pessoa, setPessoa] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      title={`Atribuir ${quantos} caso${quantos > 1 ? "s" : ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            loading={salvando}
            onClick={async () => {
              setSalvando(true);
              try {
                await onConfirmar(pessoa);
              } finally {
                setSalvando(false);
              }
            }}
          >
            {pessoa ? "Atribuir" : "Deixar sem responsável"}
          </Button>
        </>
      }
    >
      <Field label="Responsável" htmlFor="lote-responsavel">
        <SeletorResponsavel id="lote-responsavel" value={pessoa ?? undefined} onChange={setPessoa} />
      </Field>
    </Modal>
  );
}
