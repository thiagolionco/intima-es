"use client";

import { ArrowLeft, KeyRound, MailCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Aviso, BotaoPrincipal, Cabecalho, ErroCampo, LinkCaixaDeSaida, Rotulo } from "@/components/auth/blocos";
import { CampoTexto } from "@/components/auth/campos";
import { api } from "@/lib/auth/api";
import { emailValido } from "@/lib/auth/politica-senha";

function Esqueci() {
  const [email, setEmail] = useState(useSearchParams().get("email") ?? "");
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!emailValido(email)) return setErro("Digite um e-mail válido.");
    setCarregando(true);
    setErro("");
    try {
      await api("/api/auth/esqueci-a-senha", { body: { email } });
      setEnviado(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar.");
    } finally {
      setCarregando(false);
    }
  }

  if (enviado) {
    return (
      <>
        <Cabecalho
          icone={<MailCheck className="h-6 w-6" />}
          titulo="Verifique sua caixa de entrada"
          subtitulo={<>Se existir uma conta para <strong className="text-slate-800">{email}</strong>, você receberá um link para criar uma nova senha. O link vale por 30 minutos.</>}
        />
        <LinkCaixaDeSaida className="mb-6" />
        <Link href="/entrar" className="flex items-center justify-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Voltar ao login
        </Link>
      </>
    );
  }

  return (
    <>
      <Cabecalho icone={<KeyRound className="h-6 w-6" />} titulo="Esqueceu a senha?" subtitulo="Informe o e-mail da conta e enviaremos um link seguro para você criar uma nova senha." />
      {erro && !erro.startsWith("Digite") && <Aviso tom="erro">{erro}</Aviso>}
      <form onSubmit={enviar} className="space-y-5" noValidate>
        <div>
          <Rotulo htmlFor="email">E-mail</Rotulo>
          <CampoTexto id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus invalido={erro.startsWith("Digite")} />
          <ErroCampo>{erro.startsWith("Digite") ? erro : ""}</ErroCampo>
        </div>
        <BotaoPrincipal carregando={carregando}>Enviar link de redefinição</BotaoPrincipal>
      </form>
      <Link href="/entrar" className="mt-8 flex items-center justify-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Voltar ao login
      </Link>
    </>
  );
}

export default function Pagina() {
  return (
    <Suspense>
      <Esqueci />
    </Suspense>
  );
}
