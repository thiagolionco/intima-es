"use client";

import clsx from "clsx";
import { Send } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, Select } from "@/components/ui";
import { api } from "@/lib/auth/api";
import { useSessao } from "@/lib/auth/sessao";
import { useStore } from "@/lib/store";
import { AVISOS_PADRAO, type PreferenciasAvisos } from "@/lib/types";

const OPCOES_DIAS = [5, 3, 2, 1, 0];
const rotuloDias = (n: number) => (n === 0 ? "No dia" : n === 1 ? "1 dia útil antes" : `${n} dias úteis antes`);

/** Liga os avisos de prazo por e-mail e escolhe quando eles saem. */
export function ConfigAvisos() {
  const { preferencias, salvarPreferencias } = useStore();
  const { usuario } = useSessao();
  const { toast } = useToast();
  const [testando, setTestando] = useState(false);
  const a = preferencias.avisos ?? AVISOS_PADRAO;
  const mudar = (parcial: Partial<PreferenciasAvisos>) => salvarPreferencias({ ...preferencias, avisos: { ...a, ...parcial } });

  return (
    <Card className="mb-6">
      <CardHeader
        title="Avisos por e-mail"
        subtitle={usuario ? `Um e-mail por dia para ${usuario.email}, só quando houver prazo chegando, com o botão “Já cumpri”.` : undefined}
        action={
          <button
            role="switch"
            aria-checked={a.ativo}
            aria-label={a.ativo ? "Desligar avisos" : "Ligar avisos"}
            onClick={() => {
              mudar({ ativo: !a.ativo });
              toast(a.ativo ? "Avisos desligados" : "Avisos ligados");
            }}
            className={clsx("relative h-6 w-11 shrink-0 rounded-full transition", a.ativo ? "bg-brand-600" : "bg-slate-300")}
          >
            <span className={clsx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", a.ativo ? "left-[22px]" : "left-0.5")} />
          </button>
        }
      />
      <div className={clsx("flex flex-col gap-4 p-5 lg:flex-row lg:items-end", !a.ativo && "opacity-60")}>
        <fieldset className="flex-1">
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Avisar</legend>
          <div className="flex flex-wrap gap-2">
            {OPCOES_DIAS.map((n) => {
              const marcado = a.diasAntes.includes(n);
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={marcado}
                  onClick={() => mudar({ diasAntes: marcado ? a.diasAntes.filter((x) => x !== n) : [...a.diasAntes, n].sort((x, y) => y - x) })}
                  className={clsx("rounded-lg px-3 py-1.5 text-sm ring-1 ring-inset transition", marcado ? "bg-brand-50 font-medium text-brand-800 ring-brand-300" : "text-slate-600 ring-slate-200 hover:bg-slate-50")}
                >
                  {rotuloDias(n)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className="text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">A partir de</span>
          <Select value={a.hora} onChange={(e) => mudar({ hora: Number(e.target.value) })} className="w-28" aria-label="Hora do aviso">
            {Array.from({ length: 17 }, (_, i) => i + 5).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}h
              </option>
            ))}
          </Select>
        </label>
        <Button
          variant="secondary"
          loading={testando}
          icon={<Send className="h-4 w-4" />}
          onClick={async () => {
            setTestando(true);
            try {
              const { prazos } = await api<{ prazos: number }>("/api/avisos/teste", { method: "POST" });
              toast(prazos ? `Aviso enviado com ${prazos} prazo(s)` : "Nenhum prazo chegando agora", {
                tom: prazos ? "success" : "info",
                descricao: prazos ? "Confira sua caixa de entrada." : "O e-mail só sai quando algum prazo entra nos dias escolhidos.",
              });
            } catch (e) {
              toast("Não foi possível enviar", { tom: "error", descricao: e instanceof Error ? e.message : undefined });
            } finally {
              setTestando(false);
            }
          }}
        >
          Enviar agora
        </Button>
      </div>
    </Card>
  );
}
