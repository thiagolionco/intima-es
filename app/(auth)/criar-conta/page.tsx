"use client";

import clsx from "clsx";
import { ArrowLeft, ArrowRight, Building2, Check, Copy, UserPlus, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Aviso, BotaoPrincipal, Cabecalho, ErroCampo, Rotulo } from "@/components/auth/blocos";
import { CampoSenha, CampoTexto, MedidorSenha } from "@/components/auth/campos";
import { api, ErroApi } from "@/lib/auth/api";
import { gerarSenhaForte } from "@/lib/auth/gerar-senha";
import { avaliarSenha, emailValido } from "@/lib/auth/politica-senha";

const ETAPAS = ["Identificação", "Segurança", "Revisão"] as const;

function Passos({ atual }: { atual: number }) {
  return (
    <ol className="mb-8 flex items-center gap-2" aria-label="Etapas do cadastro">
      {ETAPAS.map((rotulo, i) => (
        <li key={rotulo} className="flex flex-1 items-center gap-2" aria-current={i === atual ? "step" : undefined}>
          <span
            className={clsx(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition",
              i < atual ? "bg-emerald-500 text-white" : i === atual ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400",
            )}
          >
            {i < atual ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span className={clsx("hidden text-xs font-medium sm:block", i === atual ? "text-slate-900" : "text-slate-400")}>{rotulo}</span>
          {i < ETAPAS.length - 1 && <span className={clsx("h-px flex-1", i < atual ? "bg-emerald-400" : "bg-slate-200")} />}
        </li>
      ))}
    </ol>
  );
}

export default function CriarConta() {
  const router = useRouter();
  const [etapa, setEtapa] = useState(0);
  const [dados, setDados] = useState({ nome: "", email: "", escritorio: "", oab: "", senha: "", confirmacao: "" });
  const [termos, setTermos] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [senhaGerada, setSenhaGerada] = useState(false);
  const [copiada, setCopiada] = useState(false);

  const set = (campo: keyof typeof dados) => (e: { target: { value: string } }) => {
    setDados((d) => ({ ...d, [campo]: e.target.value }));
    if (erros[campo]) setErros(({ [campo]: _, ...resto }) => resto);
  };

  function validar(n: number): boolean {
    const e: Record<string, string> = {};
    if (n === 0) {
      if (dados.nome.trim().split(/\s+/).length < 2) e.nome = "Informe nome e sobrenome.";
      if (!emailValido(dados.email)) e.email = "Digite um e-mail válido.";
    }
    if (n === 1) {
      if (!avaliarSenha(dados.senha, { email: dados.email, nome: dados.nome }).valida) e.senha = "A senha ainda não atende aos requisitos abaixo.";
      if (dados.senha !== dados.confirmacao) e.confirmacao = "As senhas não coincidem.";
    }
    if (n === 2 && !termos) e.termos = "Para continuar, aceite os termos.";
    setErros(e);
    return Object.keys(e).length === 0;
  }

  function avancar(e: FormEvent) {
    e.preventDefault();
    if (validar(etapa)) setEtapa((n) => n + 1);
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!validar(2)) return;
    setEnviando(true);
    setErroGeral("");
    try {
      const { email } = await api<{ email: string }>("/api/auth/cadastro", {
        body: { nome: dados.nome, email: dados.email, senha: dados.senha, escritorio: dados.escritorio, oab: dados.oab, aceitouTermos: termos },
      });
      router.push(`/verifique-seu-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      if (err instanceof ErroApi && err.campo) {
        setErros({ [err.campo]: err.message });
        setEtapa(err.campo === "senha" ? 1 : err.campo === "termos" ? 2 : 0);
      } else setErroGeral(err instanceof Error ? err.message : "Não foi possível criar a conta.");
      setEnviando(false);
    }
  }

  function sugerirSenha() {
    const s = gerarSenhaForte();
    setDados((d) => ({ ...d, senha: s, confirmacao: s }));
    setSenhaGerada(true);
    setCopiada(false);
  }

  return (
    <>
      <Cabecalho titulo="Crie sua conta" subtitulo="Seu espaço de trabalho é privado: só você vê suas intimações e clientes." />
      <Passos atual={etapa} />
      {erroGeral && <Aviso tom="erro">{erroGeral}</Aviso>}

      {etapa === 0 && (
        <form onSubmit={avancar} className="space-y-4" noValidate>
          <div>
            <Rotulo htmlFor="nome">Nome completo</Rotulo>
            <CampoTexto id="nome" value={dados.nome} onChange={set("nome")} autoComplete="name" autoFocus invalido={!!erros.nome} />
            <ErroCampo>{erros.nome}</ErroCampo>
          </div>
          <div>
            <Rotulo htmlFor="email">E-mail profissional</Rotulo>
            <CampoTexto id="email" type="email" value={dados.email} onChange={set("email")} autoComplete="email" placeholder="nome@escritorio.com.br" invalido={!!erros.email} />
            <ErroCampo>{erros.email}</ErroCampo>
          </div>
          <div className="grid grid-cols-5 gap-3">
            <div className="col-span-3">
              <Rotulo htmlFor="escritorio" extra={<span className="text-xs text-slate-400">opcional</span>}>
                Escritório
              </Rotulo>
              <CampoTexto id="escritorio" value={dados.escritorio} onChange={set("escritorio")} autoComplete="organization" />
            </div>
            <div className="col-span-2">
              <Rotulo htmlFor="oab" extra={<span className="text-xs text-slate-400">opcional</span>}>
                OAB
              </Rotulo>
              <CampoTexto id="oab" value={dados.oab} onChange={set("oab")} placeholder="123456/SP" />
            </div>
          </div>
          <BotaoPrincipal className="!mt-6">
            Continuar <ArrowRight className="h-4 w-4" />
          </BotaoPrincipal>
        </form>
      )}

      {etapa === 1 && (
        <form onSubmit={avancar} className="space-y-4" noValidate>
          <div>
            <Rotulo
              htmlFor="senha"
              extra={
                <button type="button" onClick={sugerirSenha} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                  <WandSparkles className="h-3.5 w-3.5" /> Gerar senha forte
                </button>
              }
            >
              Crie uma senha
            </Rotulo>
            <CampoSenha
              id="senha"
              value={dados.senha}
              onChange={(e) => {
                set("senha")(e);
                setSenhaGerada(false);
              }}
              autoComplete="new-password"
              autoFocus
              invalido={!!erros.senha}
            />
            <ErroCampo>{erros.senha}</ErroCampo>
            {senhaGerada && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span>
                  Senha sugerida: <code className="font-mono text-slate-900">{dados.senha}</code>
                </span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(dados.senha).then(() => setCopiada(true))}
                  className="flex items-center gap-1 font-medium text-brand-700"
                >
                  {copiada ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiada ? "Copiada" : "Copiar"}
                </button>
              </div>
            )}
            <MedidorSenha senha={dados.senha} email={dados.email} nome={dados.nome} />
          </div>
          <div>
            <Rotulo htmlFor="confirmacao">Confirme a senha</Rotulo>
            <CampoSenha id="confirmacao" value={dados.confirmacao} onChange={set("confirmacao")} autoComplete="new-password" invalido={!!erros.confirmacao} />
            <ErroCampo>{erros.confirmacao}</ErroCampo>
          </div>
          <div className="!mt-6 flex gap-3">
            <button type="button" onClick={() => setEtapa(0)} className="flex items-center gap-1 rounded-xl px-4 text-sm font-medium text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <BotaoPrincipal>
              Continuar <ArrowRight className="h-4 w-4" />
            </BotaoPrincipal>
          </div>
        </form>
      )}

      {etapa === 2 && (
        <form onSubmit={enviar} className="space-y-5" noValidate>
          <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
            {[
              ["Nome", dados.nome],
              ["E-mail", dados.email],
              ["Escritório", dados.escritorio || "—"],
              ["OAB", dados.oab || "—"],
              ["Senha", "•".repeat(Math.min(dados.senha.length, 16))],
            ].map(([rotulo, valor], i) => (
              <div key={rotulo} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <dt className="text-slate-500">{rotulo}</dt>
                <dd className="flex items-center gap-2 truncate font-medium text-slate-900">
                  <span className="truncate">{valor}</span>
                  <button type="button" onClick={() => setEtapa(i < 4 ? 0 : 1)} className="text-xs font-medium text-brand-700 hover:underline">
                    Editar
                  </button>
                </dd>
              </div>
            ))}
          </dl>
          <label className={clsx("flex cursor-pointer items-start gap-3 rounded-xl border p-3", erros.termos ? "border-red-300 bg-red-50" : "border-slate-200")}>
            <input type="checkbox" checked={termos} onChange={(e) => {
              setTermos(e.target.checked);
              setErros({});
            }} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
            <span className="text-sm text-slate-600">
              Li e aceito os <strong>termos de uso</strong> e a <strong>política de privacidade</strong>. Entendo que meus dados ficam isolados na minha conta e que posso exportá-los ou excluí-los a qualquer momento (LGPD).
            </span>
          </label>
          <ErroCampo>{erros.termos}</ErroCampo>
          <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
            Enviaremos um link de confirmação para <strong className="text-slate-700">{dados.email}</strong>. A conta só é ativada depois da confirmação.
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setEtapa(1)} className="flex items-center gap-1 rounded-xl px-4 text-sm font-medium text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <BotaoPrincipal carregando={enviando}>
              <UserPlus className="h-4 w-4" /> Criar conta
            </BotaoPrincipal>
          </div>
        </form>
      )}

      <p className="mt-8 text-center text-sm text-slate-500">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-semibold text-brand-700 hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
