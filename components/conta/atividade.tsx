"use client";

import clsx from "clsx";
import { AlertTriangle, Download, Fingerprint, KeyRound, LogIn, LogOut, MailCheck, MonitorX, ShieldOff, UserPlus, UserRound, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert, Card, CardHeader, Skeleton } from "@/components/ui";
import { api } from "@/lib/auth/api";
import { rotuloDispositivo } from "@/lib/auth/dispositivo";
import type { EventoAuditoria } from "@/lib/auth/tipos";
import { formatDateTime } from "@/lib/utils";
import { tempoRelativo } from "./sessoes";

type Grupo = "acesso" | "seguranca" | "conta";

const EVENTOS: Record<string, { rotulo: string; icone: LucideIcon; tom: string; grupo: Grupo }> = {
  "conta.criada": { rotulo: "Conta criada", icone: UserPlus, tom: "bg-brand-50 text-brand-600", grupo: "conta" },
  "email.confirmado": { rotulo: "E-mail confirmado", icone: MailCheck, tom: "bg-emerald-50 text-emerald-600", grupo: "conta" },
  "login.sucesso": { rotulo: "Login realizado", icone: LogIn, tom: "bg-emerald-50 text-emerald-600", grupo: "acesso" },
  "login.falha": { rotulo: "Tentativa de login recusada", icone: AlertTriangle, tom: "bg-amber-50 text-amber-600", grupo: "acesso" },
  "login.bloqueado": { rotulo: "Acesso bloqueado temporariamente", icone: ShieldOff, tom: "bg-red-50 text-red-600", grupo: "acesso" },
  logout: { rotulo: "Saiu da conta", icone: LogOut, tom: "bg-slate-100 text-slate-500", grupo: "acesso" },
  "senha.alterada": { rotulo: "Senha alterada", icone: KeyRound, tom: "bg-brand-50 text-brand-600", grupo: "seguranca" },
  "senha.redefinicao_solicitada": { rotulo: "Redefinição de senha solicitada", icone: KeyRound, tom: "bg-amber-50 text-amber-600", grupo: "seguranca" },
  "senha.redefinida": { rotulo: "Senha redefinida por e-mail", icone: KeyRound, tom: "bg-brand-50 text-brand-600", grupo: "seguranca" },
  "sessao.encerrada": { rotulo: "Sessão de outro dispositivo encerrada", icone: MonitorX, tom: "bg-slate-100 text-slate-600", grupo: "seguranca" },
  "sessoes.encerradas": { rotulo: "Outras sessões encerradas", icone: MonitorX, tom: "bg-slate-100 text-slate-600", grupo: "seguranca" },
  "2fa.ativado": { rotulo: "Verificação em duas etapas ativada", icone: Fingerprint, tom: "bg-emerald-50 text-emerald-600", grupo: "seguranca" },
  "2fa.desativado": { rotulo: "Verificação em duas etapas desativada", icone: ShieldOff, tom: "bg-red-50 text-red-600", grupo: "seguranca" },
  "2fa.codigos_regenerados": { rotulo: "Novos códigos de recuperação", icone: Fingerprint, tom: "bg-brand-50 text-brand-600", grupo: "seguranca" },
  "2fa.codigo_recuperacao_usado": { rotulo: "Código de recuperação usado", icone: Fingerprint, tom: "bg-amber-50 text-amber-600", grupo: "seguranca" },
  "perfil.atualizado": { rotulo: "Perfil atualizado", icone: UserRound, tom: "bg-slate-100 text-slate-600", grupo: "conta" },
  "dados.exportados": { rotulo: "Dados pessoais exportados", icone: Download, tom: "bg-slate-100 text-slate-600", grupo: "conta" },
};

const FILTROS: { id: Grupo | "todos"; rotulo: string }[] = [
  { id: "todos", rotulo: "Tudo" },
  { id: "acesso", rotulo: "Acessos" },
  { id: "seguranca", rotulo: "Segurança" },
  { id: "conta", rotulo: "Conta" },
];

export function AbaAtividade() {
  const [eventos, setEventos] = useState<EventoAuditoria[] | null>(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<Grupo | "todos">("todos");

  useEffect(() => {
    api<{ eventos: EventoAuditoria[] }>("/api/conta/atividade")
      .then((r) => setEventos(r.eventos))
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar."));
  }, []);

  const visiveis = useMemo(() => (eventos ?? []).filter((e) => filtro === "todos" || EVENTOS[e.tipo]?.grupo === filtro), [eventos, filtro]);
  const falhas = (eventos ?? []).filter((e) => e.tipo === "login.falha" && Date.now() - new Date(e.em).getTime() < 7 * 864e5).length;

  return (
    <Card>
      <CardHeader
        title="Registro de atividade"
        subtitle="Auditoria dos eventos de acesso e segurança da sua conta (últimos 300)."
        action={
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {FILTROS.map((f) => (
              <button key={f.id} onClick={() => setFiltro(f.id)} className={clsx("rounded-md px-2.5 py-1 text-xs font-medium transition", filtro === f.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {f.rotulo}
              </button>
            ))}
          </div>
        }
      />
      {erro && (
        <div className="p-5">
          <Alert>{erro}</Alert>
        </div>
      )}
      {falhas > 0 && (
        <div className="px-5 pt-5">
          <Alert tone="warning" title={`${falhas} tentativa(s) de login recusada(s) nos últimos 7 dias`}>
            Se não foi você, troque a senha e ative a verificação em duas etapas.
          </Alert>
        </div>
      )}
      <ol className="relative px-5 py-4">
        {!eventos && !erro && [0, 1, 2].map((i) => <Skeleton key={i} className="my-3 h-10" />)}
        {eventos && !visiveis.length && <li className="py-8 text-center text-sm text-slate-400">Nenhum evento neste filtro.</li>}
        {visiveis.map((e, i) => {
          const def = EVENTOS[e.tipo] ?? { rotulo: e.tipo, icone: UserRound, tom: "bg-slate-100 text-slate-500", grupo: "conta" };
          const Icone = def.icone;
          return (
            <li key={e.id} className="relative flex gap-4 pb-5">
              {i < visiveis.length - 1 && <span className="absolute left-[17px] top-9 h-[calc(100%-28px)] w-px bg-slate-200" aria-hidden />}
              <span className={clsx("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full", def.tom)}>
                <Icone className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <p className="text-sm font-medium text-slate-900">
                  {def.rotulo}
                  {e.detalhe && <span className="font-normal text-slate-500"> · {e.detalhe}</span>}
                </p>
                <p className="mt-0.5 text-xs text-slate-500" title={formatDateTime(e.em)}>
                  {tempoRelativo(e.em)} · {formatDateTime(e.em)} · {rotuloDispositivo(e.userAgent)} · IP {e.ip}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
