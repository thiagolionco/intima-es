"use client";

import { CalendarPlus, RefreshCw, Unplug } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader } from "@/components/ui";
import { api } from "@/lib/auth/api";
import { formatDateTime } from "@/lib/utils";

interface EstadoAgenda {
  disponivel: boolean;
  conectado: boolean;
  conectadoEm?: string;
  prazosNaAgenda?: number;
  ultimaSincronizacao?: string;
  erro?: string;
}

/** Liga a conta à Google Agenda. Só aparece quando o servidor tem as chaves do Google. */
export function ConfigAgenda() {
  const { toast } = useToast();
  const [estado, setEstado] = useState<EstadoAgenda | null>(null);
  const [ocupado, setOcupado] = useState<"sincronizar" | "desconectar" | null>(null);
  const avisou = useRef(false);

  useEffect(() => {
    api<EstadoAgenda>("/api/google")
      .then(setEstado)
      .catch(() => setEstado(null));
    // Resultado da volta do Google (?google=conectado|erro).
    if (avisou.current) return;
    avisou.current = true;
    const p = new URLSearchParams(window.location.search);
    const r = p.get("google");
    if (!r) return;
    if (r === "conectado") toast("Google Agenda conectada", { descricao: "Os prazos em aberto estão na agenda “Prazos · Clepsa”." });
    else toast("Não foi possível conectar", { tom: "error", descricao: p.get("motivo") ?? undefined });
    window.history.replaceState(null, "", window.location.pathname);
  }, [toast]);

  if (!estado?.disponivel) return null;

  async function acao(tipo: "sincronizar" | "desconectar") {
    setOcupado(tipo);
    try {
      const novo = await api<EstadoAgenda>(tipo === "sincronizar" ? "/api/google/sincronizar" : "/api/google", { method: tipo === "sincronizar" ? "POST" : "DELETE", body: {} });
      setEstado(novo);
      if (tipo === "desconectar") toast("Google Agenda desconectada", { descricao: "A agenda “Prazos · Clepsa” continua no Google; apague-a por lá se quiser." });
      else if (!novo.erro) toast("Agenda em dia");
    } catch (e) {
      toast("Algo deu errado", { tom: "error", descricao: e instanceof Error ? e.message : undefined });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title="Google Agenda"
        subtitle={
          estado.conectado
            ? `${estado.prazosNaAgenda ?? 0} prazo(s) em aberto na agenda “Prazos · Clepsa”${estado.ultimaSincronizacao ? `, atualizada em ${formatDateTime(estado.ultimaSincronizacao)}` : ""}.`
            : "Cada prazo em aberto vira um evento de dia inteiro numa agenda separada, “Prazos · Clepsa”. O Clepsa não vê seus outros compromissos."
        }
        action={
          estado.conectado ? (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={ocupado === "sincronizar"} onClick={() => acao("sincronizar")}>
                Sincronizar agora
              </Button>
              <Button size="sm" variant="ghost" icon={<Unplug className="h-4 w-4" />} loading={ocupado === "desconectar"} onClick={() => acao("desconectar")}>
                Desconectar
              </Button>
            </div>
          ) : (
            <a href="/api/google/conectar">
              <Button size="sm" icon={<CalendarPlus className="h-4 w-4" />}>
                Conectar
              </Button>
            </a>
          )
        }
      />
      {estado.erro && (
        <p className="px-5 py-3 text-sm text-amber-800" role="alert">
          {estado.erro}
        </p>
      )}
    </Card>
  );
}
