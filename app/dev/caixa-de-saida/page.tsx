"use client";

import clsx from "clsx";
import { Inbox, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface Email {
  id: string;
  para: string;
  assunto: string;
  html: string;
  texto: string;
  enviadoEm: string;
}

/**
 * Caixa de saída de desenvolvimento: mostra os e-mails que o sistema "enviou" enquanto
 * EMAIL_PROVIDER=console. Em produção só existe com ENABLE_DEV_OUTBOX=true.
 */
export default function CaixaDeSaida() {
  const [emails, setEmails] = useState<Email[] | null>(null);
  const [indisponivel, setIndisponivel] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/dev/caixa-de-saida", { cache: "no-store" });
    if (!r.ok) return setIndisponivel(true);
    const j = (await r.json()) as { emails: Email[] };
    setEmails(j.emails);
    setSelecionado((s) => s ?? j.emails[0]?.id ?? null);
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 4000);
    return () => clearInterval(t);
  }, [carregar]);

  if (indisponivel) return <p className="p-10 text-center text-sm text-slate-500">A caixa de saída de desenvolvimento está desativada neste ambiente.</p>;

  const atual = emails?.find((e) => e.id === selecionado);

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-5 py-3">
        <div className="flex items-center gap-2 text-sm text-amber-900">
          <Inbox className="h-4 w-4" />
          <strong>Caixa de saída de desenvolvimento</strong>
          <span className="hidden text-amber-700 sm:inline">· nenhum destes e-mails saiu do seu computador</span>
        </div>
        <div className="flex gap-2">
          <button onClick={carregar} className="rounded-lg p-2 text-amber-800 hover:bg-amber-100" aria-label="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={async () => {
              await fetch("/api/dev/caixa-de-saida", { method: "DELETE" });
              setSelecionado(null);
              carregar();
            }}
            className="rounded-lg p-2 text-amber-800 hover:bg-amber-100"
            aria-label="Limpar caixa de saída"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <ul className="w-80 shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
          {emails?.length === 0 && <li className="p-6 text-center text-sm text-slate-400">Nenhum e-mail ainda. Crie uma conta para ver o de confirmação aqui.</li>}
          {emails?.map((e) => (
            <li key={e.id}>
              <button onClick={() => setSelecionado(e.id)} className={clsx("w-full border-b border-slate-100 px-4 py-3 text-left", e.id === selecionado ? "bg-brand-50" : "hover:bg-slate-50")}>
                <p className="truncate text-sm font-medium text-slate-900">{e.assunto}</p>
                <p className="truncate text-xs text-slate-500">para {e.para}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{new Date(e.enviadoEm).toLocaleString("pt-BR")}</p>
              </button>
            </li>
          ))}
        </ul>
        <section className="min-w-0 flex-1">
          {atual ? (
            <iframe title={atual.assunto} srcDoc={atual.html.replace("<head>", '<head><base target="_top">').replace("<body", '<base target="_top"><body')} sandbox="allow-top-navigation-by-user-activation allow-popups" className="h-full w-full bg-white" />
          ) : (
            <p className="p-10 text-center text-sm text-slate-400">Selecione um e-mail.</p>
          )}
        </section>
      </div>
    </div>
  );
}
