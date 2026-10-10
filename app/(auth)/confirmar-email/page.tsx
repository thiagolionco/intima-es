"use client";

import { BadgeCheck, CircleX, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BotaoPrincipal, Cabecalho } from "@/components/auth/blocos";
import { api } from "@/lib/auth/api";
import { lerTokenDoFragmento } from "@/lib/auth/fragmento";

export default function ConfirmarEmail() {
  const [estado, setEstado] = useState<{ tipo: "verificando" } | { tipo: "ok"; email: string } | { tipo: "erro"; mensagem: string }>({ tipo: "verificando" });
  const executado = useRef(false);

  useEffect(() => {
    if (executado.current) return;
    executado.current = true;
    const token = lerTokenDoFragmento();
    if (!token) return setEstado({ tipo: "erro", mensagem: "O link está incompleto. Abra novamente o link do e-mail." });
    api<{ email: string }>("/api/auth/confirmar-email", { body: { token } })
      .then(({ email }) => setEstado({ tipo: "ok", email }))
      .catch((e) => setEstado({ tipo: "erro", mensagem: e instanceof Error ? e.message : "Não foi possível confirmar." }));
  }, []);

  if (estado.tipo === "verificando") {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm text-slate-500" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" /> Confirmando seu e-mail…
      </div>
    );
  }

  if (estado.tipo === "erro") {
    return (
      <>
        <Cabecalho icone={<CircleX className="h-6 w-6 text-red-600" />} titulo="Link inválido ou expirado" subtitulo={estado.mensagem} />
        <p className="mb-6 text-sm text-slate-600">Tente entrar normalmente: se o e-mail ainda não estiver confirmado, você poderá pedir um novo link na própria tela de login.</p>
        <Link href="/entrar" className="block">
          <BotaoPrincipal>Ir para o login</BotaoPrincipal>
        </Link>
      </>
    );
  }

  return (
    <>
      <Cabecalho icone={<BadgeCheck className="h-6 w-6 text-emerald-600" />} titulo="E-mail confirmado!" subtitulo={<>Tudo certo com <strong className="text-slate-800">{estado.email}</strong>. Sua conta está ativa.</>} />
      <div className="mb-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Próximo passo recomendado</p>
        <p className="mt-1">Depois de entrar, ative a verificação em duas etapas em <em>Minha conta › Segurança</em>.</p>
      </div>
      <Link href={`/entrar?confirmado=1&email=${encodeURIComponent(estado.email)}`} className="block">
        <BotaoPrincipal>Entrar agora</BotaoPrincipal>
      </Link>
    </>
  );
}
