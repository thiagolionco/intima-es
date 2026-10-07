"use client";

import { LogOut, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, CardHeader, Skeleton } from "@/components/ui";
import { api } from "@/lib/auth/api";
import { descreverDispositivo } from "@/lib/auth/dispositivo";
import type { SessaoResumo } from "@/lib/auth/tipos";
import { formatDateTime } from "@/lib/utils";

export function tempoRelativo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora mesmo";
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

export function AbaSessoes() {
  const { toast } = useToast();
  const [sessoes, setSessoes] = useState<SessaoResumo[] | null>(null);
  const [erro, setErro] = useState("");
  const [confirmarTodas, setConfirmarTodas] = useState(false);
  const [encerrando, setEncerrando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setSessoes((await api<{ sessoes: SessaoResumo[] }>("/api/conta/sessoes")).sessoes);
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function encerrar(id: string) {
    setEncerrando(id);
    try {
      await api(`/api/conta/sessoes/${id}`, { method: "DELETE" });
      toast("Sessão encerrada", { descricao: "O dispositivo precisará entrar novamente." });
      await carregar();
    } catch (e) {
      toast("Não foi possível encerrar", { tom: "error", descricao: e instanceof Error ? e.message : undefined });
    } finally {
      setEncerrando(null);
    }
  }

  const outras = sessoes?.filter((s) => !s.atual).length ?? 0;

  return (
    <Card>
      <CardHeader
        title="Dispositivos conectados"
        subtitle="Sessões ativas na sua conta. Encerre qualquer uma que você não reconheça."
        action={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={carregar} aria-label="Atualizar lista">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm" disabled={!outras} onClick={() => setConfirmarTodas(true)} icon={<LogOut className="h-4 w-4" />}>
              Encerrar as outras ({outras})
            </Button>
          </div>
        }
      />
      {erro && (
        <div className="p-5">
          <Alert>{erro}</Alert>
        </div>
      )}
      <ul className="divide-y divide-slate-100">
        {!sessoes &&
          [0, 1].map((i) => (
            <li key={i} className="flex gap-4 p-5">
              <Skeleton className="h-10 w-10" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-72" />
              </div>
            </li>
          ))}
        {sessoes?.map((s) => {
          const d = descreverDispositivo(s.userAgent);
          const Icone = d.movel ? Smartphone : Monitor;
          return (
            <li key={s.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Icone className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                  {d.navegador} no {d.sistema}
                  {s.atual && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">Este dispositivo</span>}
                  {s.lembrar && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Mantém conectado</span>}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  IP {s.ip} · entrou em {formatDateTime(s.criadaEm)} · ativo {tempoRelativo(s.ultimoUsoEm)} · expira em {formatDateTime(s.expiraEm)}
                </p>
              </div>
              {!s.atual && (
                <Button variant="secondary" size="sm" loading={encerrando === s.id} onClick={() => encerrar(s.id)}>
                  Encerrar
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={confirmarTodas}
        onClose={() => setConfirmarTodas(false)}
        title="Encerrar as outras sessões?"
        description={`${outras} dispositivo(s) serão desconectados e precisarão entrar de novo. Esta sessão continua ativa.`}
        confirmLabel="Encerrar sessões"
        onConfirm={async () => {
          const r = await api<{ encerradas: number }>("/api/conta/sessoes/encerrar-outras", { body: {} });
          toast("Sessões encerradas", { descricao: `${r.encerradas} dispositivo(s) desconectado(s).` });
          carregar();
        }}
      />
    </Card>
  );
}
