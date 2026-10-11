"use client";

import { BadgeCheck, CalendarClock, CircleX, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BotaoPrincipal, Cabecalho } from "@/components/auth/blocos";
import { api } from "@/lib/auth/api";
import { lerTokenDoFragmento } from "@/lib/auth/fragmento";
import { formatDate } from "@/lib/utils";

interface Resumo {
  processo: string;
  cliente: string;
  prazo: string | null;
  status: string;
}

type Estado = { tipo: "verificando" } | { tipo: "confirmar"; token: string; r: Resumo } | { tipo: "ok"; r: Resumo } | { tipo: "erro"; mensagem: string };

/**
 * Destino do botão "Já cumpri" dos avisos de prazo. Mostra o que será marcado e só marca com um
 * clique, para que leitores de e-mail que abrem os links sozinhos não marquem nada.
 */
export default function Cumprir() {
  const [estado, setEstado] = useState<Estado>({ tipo: "verificando" });
  const [enviando, setEnviando] = useState(false);
  const executado = useRef(false);

  useEffect(() => {
    if (executado.current) return;
    executado.current = true;
    const token = lerTokenDoFragmento();
    if (!token) return setEstado({ tipo: "erro", mensagem: "O link está incompleto. Abra novamente o link do e-mail." });
    api<Resumo>("/api/avisos/cumprir/consultar", { body: { token } })
      .then((r) => setEstado(r.status === "respondida" || r.status === "arquivada" ? { tipo: "ok", r } : { tipo: "confirmar", token, r }))
      .catch((e) => setEstado({ tipo: "erro", mensagem: e instanceof Error ? e.message : "Não foi possível abrir o link." }));
  }, []);

  if (estado.tipo === "verificando") {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm text-slate-500" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" /> Abrindo o aviso…
      </div>
    );
  }

  if (estado.tipo === "erro") {
    return (
      <>
        <Cabecalho icone={<CircleX className="h-6 w-6 text-red-600" />} titulo="Não deu para usar este link" subtitulo={estado.mensagem} />
        <Link href="/intimacoes" className="block">
          <BotaoPrincipal>Abrir o Clepsa</BotaoPrincipal>
        </Link>
      </>
    );
  }

  const r = estado.r;
  const detalhe = (
    <div className="mb-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
      <p className="font-mono font-medium text-slate-800">{r.processo}</p>
      <p className="mt-1">{r.cliente}</p>
      {r.prazo && <p className="mt-1">Prazo: {formatDate(r.prazo)}</p>}
    </div>
  );

  if (estado.tipo === "ok") {
    return (
      <>
        <Cabecalho icone={<BadgeCheck className="h-6 w-6 text-emerald-600" />} titulo="Prazo marcado como cumprido" subtitulo="O Clepsa não vai mais avisar sobre esta intimação." />
        {detalhe}
        <Link href="/intimacoes" className="block">
          <BotaoPrincipal>Abrir o Clepsa</BotaoPrincipal>
        </Link>
      </>
    );
  }

  return (
    <>
      <Cabecalho icone={<CalendarClock className="h-6 w-6 text-brand-600" />} titulo="Marcar como cumprido?" subtitulo="A intimação passa para “Respondida” e os avisos dela param." />
      {detalhe}
      <BotaoPrincipal
        carregando={enviando}
        onClick={async () => {
          setEnviando(true);
          try {
            setEstado({ tipo: "ok", r: await api<Resumo>("/api/avisos/cumprir", { body: { token: estado.token } }) });
          } catch (e) {
            setEstado({ tipo: "erro", mensagem: e instanceof Error ? e.message : "Não foi possível marcar." });
          }
        }}
      >
        Já cumpri
      </BotaoPrincipal>
    </>
  );
}
