"use client";

import { MailCheck, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Aviso, Cabecalho, LinkCaixaDeSaida, useContagem } from "@/components/auth/blocos";
import { api, ErroApi } from "@/lib/auth/api";

function Verifique() {
  const email = useSearchParams().get("email") ?? "";
  const [espera, setEspera] = useContagem(45);
  const [msg, setMsg] = useState<{ tom: "sucesso" | "erro"; texto: string } | null>(null);

  async function reenviar() {
    try {
      await api("/api/auth/reenviar-confirmacao", { body: { email } });
      setMsg({ tom: "sucesso", texto: "Enviamos um novo link. O anterior deixou de valer." });
      setEspera(60);
    } catch (e) {
      setMsg({ tom: "erro", texto: e instanceof Error ? e.message : "Não foi possível reenviar." });
      if (e instanceof ErroApi) setEspera(Number(e.detalhes.aguardarSegundos) || 60);
    }
  }

  return (
    <>
      <Cabecalho
        icone={<MailCheck className="h-6 w-6" />}
        titulo="Confirme seu e-mail"
        subtitulo={
          <>
            Enviamos um link de ativação para <strong className="text-slate-800">{email || "o seu e-mail"}</strong>. Abra a mensagem e clique em <em>Confirmar e-mail</em> para liberar o acesso.
          </>
        }
      />
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      <ol className="mb-6 space-y-3 text-sm text-slate-600">
        {["O link vale por 24 horas e só pode ser usado uma vez.", "Não encontrou? Confira as pastas de spam e promoções.", "Depois de confirmar, entre com seu e-mail e senha."].map((t, i) => (
          <li key={t} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{i + 1}</span>
            {t}
          </li>
        ))}
      </ol>
      <button
        onClick={reenviar}
        disabled={espera > 0 || !email}
        className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-semibold text-slate-800 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw className="h-4 w-4" />
        {espera > 0 ? `Reenviar em ${espera}s` : "Reenviar e-mail"}
      </button>
      <LinkCaixaDeSaida className="mt-3" />
      <p className="mt-8 text-center text-sm text-slate-500">
        E-mail errado?{" "}
        <Link href="/criar-conta" className="font-semibold text-brand-700 hover:underline">
          Cadastrar novamente
        </Link>{" "}
        ·{" "}
        <Link href={`/entrar${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="font-semibold text-brand-700 hover:underline">
          Ir para o login
        </Link>
      </p>
    </>
  );
}

export default function Pagina() {
  return (
    <Suspense>
      <Verifique />
    </Suspense>
  );
}
