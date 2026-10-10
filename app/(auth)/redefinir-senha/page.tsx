"use client";

import { CircleX, KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Aviso, BotaoPrincipal, Cabecalho, ErroCampo, Rotulo } from "@/components/auth/blocos";
import { CampoSenha, MedidorSenha } from "@/components/auth/campos";
import { api } from "@/lib/auth/api";
import { lerTokenDoFragmento } from "@/lib/auth/fragmento";
import { avaliarSenha } from "@/lib/auth/politica-senha";

export default function RedefinirSenha() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [invalido, setInvalido] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const executado = useRef(false);

  useEffect(() => {
    if (executado.current) return;
    executado.current = true;
    const t = lerTokenDoFragmento();
    if (!t) return setInvalido("O link está incompleto.");
    setToken(t);
    api<{ email: string }>("/api/auth/redefinir-senha", { body: { token: t } })
      .then((r) => setEmail(r.email))
      .catch((e) => setInvalido(e instanceof Error ? e.message : "Link inválido."));
  }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!avaliarSenha(senha, { email: email ?? "" }).valida) return setErro("A senha ainda não atende aos requisitos.");
    if (senha !== confirmacao) return setErro("As senhas não coincidem.");
    setCarregando(true);
    setErro("");
    try {
      const r = await api<{ email: string }>("/api/auth/redefinir-senha", { body: { token, senha } });
      router.replace(`/entrar?redefinida=1&email=${encodeURIComponent(r.email)}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível redefinir.");
      setCarregando(false);
    }
  }

  if (invalido) {
    return (
      <>
        <Cabecalho icone={<CircleX className="h-6 w-6 text-red-600" />} titulo="Link inválido ou expirado" subtitulo={invalido} />
        <Link href="/esqueci-a-senha" className="block">
          <BotaoPrincipal>Pedir um novo link</BotaoPrincipal>
        </Link>
      </>
    );
  }

  if (email === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm text-slate-500" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" /> Validando o link…
      </div>
    );
  }

  return (
    <>
      <Cabecalho icone={<KeyRound className="h-6 w-6" />} titulo="Crie uma nova senha" subtitulo={<>Para a conta <strong className="text-slate-800">{email}</strong>. Ao salvar, todas as sessões abertas serão encerradas.</>} />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <form onSubmit={enviar} className="space-y-5">
        <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
        <div>
          <Rotulo htmlFor="senha">Nova senha</Rotulo>
          <CampoSenha id="senha" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" autoFocus />
          <MedidorSenha senha={senha} email={email} />
        </div>
        <div>
          <Rotulo htmlFor="confirmacao">Confirme a nova senha</Rotulo>
          <CampoSenha id="confirmacao" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="new-password" invalido={!!confirmacao && confirmacao !== senha} />
          <ErroCampo>{confirmacao && confirmacao !== senha ? "As senhas não coincidem." : ""}</ErroCampo>
        </div>
        <BotaoPrincipal carregando={carregando}>Salvar nova senha</BotaoPrincipal>
      </form>
    </>
  );
}
