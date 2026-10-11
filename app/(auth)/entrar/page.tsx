"use client";

import { ArrowLeft, ArrowRight, LifeBuoy, ShieldCheck, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { Aviso, BotaoPrincipal, Cabecalho, ErroCampo, LinkCaixaDeSaida, Rotulo, useContagem } from "@/components/auth/blocos";
import { CampoSenha, CampoTexto, CodigoVerificacao } from "@/components/auth/campos";
import { Avatar } from "@/components/auth/menu-usuario";
import { api, ErroApi } from "@/lib/auth/api";
import { emailValido } from "@/lib/auth/politica-senha";
import { useSessao } from "@/lib/auth/sessao";
import type { RespostaLogin } from "@/lib/auth/tipos";

type Etapa = "email" | "senha" | "segundo_fator";

/** Só aceita destinos internos, para o parâmetro ?para= não virar um redirecionamento aberto. */
function destinoSeguro(para: string | null): string {
  return para && para.startsWith("/") && !para.startsWith("//") && !para.startsWith("/\\") ? para : "/";
}

function formatarHora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function Entrar() {
  const params = useSearchParams();
  const router = useRouter();
  const { estado, entrou } = useSessao();
  const destino = destinoSeguro(params.get("para"));

  const [etapa, setEtapa] = useState<Etapa>(params.get("email") ? "senha" : "email");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [usarRecuperacao, setUsarRecuperacao] = useState(false);
  const [desafio, setDesafio] = useState<{ id: string; expiraEm: string } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [erroEmail, setErroEmail] = useState("");
  const [reenviado, setReenviado] = useState(false);
  const [espera, setEspera] = useContagem();
  const senhaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (estado.tipo === "autenticado") router.replace(destino);
  }, [estado.tipo, destino, router]);

  useEffect(() => {
    if (etapa === "senha") senhaRef.current?.focus();
  }, [etapa]);

  const avisoInicial = params.get("expirou")
    ? { tom: "info" as const, texto: "Sua sessão expirou. Entre novamente para continuar de onde parou." }
    : params.get("saiu")
      ? { tom: "sucesso" as const, texto: "Você saiu com segurança." }
      : params.get("confirmado")
        ? { tom: "sucesso" as const, texto: "E-mail confirmado! Agora é só entrar." }
        : params.get("redefinida")
          ? { tom: "sucesso" as const, texto: "Senha redefinida. Por segurança, todas as sessões anteriores foram encerradas." }
          : params.get("excluida")
            ? { tom: "info" as const, texto: "Sua conta e todos os dados foram excluídos." }
            : null;

  function continuar(e: FormEvent) {
    e.preventDefault();
    if (!emailValido(email)) return setErroEmail("Digite um e-mail válido, como nome@escritorio.com.br.");
    setErroEmail("");
    setErro(null);
    setEtapa("senha");
  }

  async function concluir(r: RespostaLogin) {
    if (r.etapa === "segundo_fator") {
      setDesafio({ id: r.desafio, expiraEm: r.expiraEm });
      setCodigo("");
      setEtapa("segundo_fator");
      return;
    }
    entrou(r.usuario);
    router.replace(destino);
  }

  async function entrarComSenha(e: FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    try {
      await concluir(await api<RespostaLogin>("/api/auth/entrar", { body: { email, senha, lembrar } }));
    } catch (err) {
      setErro(err instanceof ErroApi ? err : new ErroApi(0, "interno", "Erro inesperado."));
      if (err instanceof ErroApi && err.codigo === "muitas_tentativas") setEspera(Number(err.detalhes.aguardarSegundos) || 60);
      setSenha("");
    } finally {
      setCarregando(false);
    }
  }

  async function verificarCodigo(valor = codigo) {
    if (!desafio) return;
    setCarregando(true);
    setErro(null);
    try {
      await concluir(await api<RespostaLogin>("/api/auth/entrar/segundo-fator", { body: { desafio: desafio.id, codigo: valor, recuperacao: usarRecuperacao } }));
    } catch (err) {
      const e = err instanceof ErroApi ? err : new ErroApi(0, "interno", "Erro inesperado.");
      setErro(e);
      setCodigo("");
      if (e.codigo === "desafio_expirado") {
        setEtapa("senha");
        setSenha("");
        setDesafio(null);
      }
    } finally {
      setCarregando(false);
    }
  }

  async function reenviarConfirmacao() {
    await api("/api/auth/reenviar-confirmacao", { body: { email } }).catch(() => undefined);
    setReenviado(true);
  }

  const mensagemErro = erro && (
    <Aviso tom="erro">
      <p>{erro.message}</p>
      {erro.codigo === "conta_bloqueada" && typeof erro.detalhes.bloqueadoAte === "string" && (
        <p className="mt-1">
          Tente novamente depois das {formatarHora(erro.detalhes.bloqueadoAte)} ou{" "}
          <Link className="font-semibold underline" href={`/esqueci-a-senha?email=${encodeURIComponent(email)}`}>
            redefina sua senha
          </Link>
          .
        </p>
      )}
      {erro.codigo === "email_nao_confirmado" &&
        (reenviado ? (
          <p className="mt-1 font-medium">Enviamos um novo link de confirmação.</p>
        ) : (
          <button onClick={reenviarConfirmacao} className="mt-1 font-semibold underline">
            Reenviar e-mail de confirmação
          </button>
        ))}
      {erro.codigo === "codigo_invalido" && typeof erro.detalhes.restantes === "number" && <p className="mt-1 text-xs">Tentativas restantes: {erro.detalhes.restantes}</p>}
      {espera > 0 && <p className="mt-1 text-xs">Você poderá tentar de novo em {espera}s.</p>}
    </Aviso>
  );

  if (etapa === "segundo_fator") {
    return (
      <>
        <Cabecalho
          icone={usarRecuperacao ? <LifeBuoy className="h-6 w-6" /> : <Smartphone className="h-6 w-6" />}
          titulo="Verificação em duas etapas"
          subtitulo={usarRecuperacao ? "Digite um dos códigos de recuperação que você guardou ao ativar a verificação. Cada código vale uma vez." : "Abra o aplicativo autenticador no seu celular e digite o código de 6 dígitos."}
        />
        {mensagemErro}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            verificarCodigo();
          }}
          className="space-y-5"
        >
          {usarRecuperacao ? (
            <div>
              <Rotulo htmlFor="recuperacao">Código de recuperação</Rotulo>
              <CampoTexto id="recuperacao" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="XXXXX-XXXXX" autoComplete="off" className="font-mono tracking-widest" autoFocus />
            </div>
          ) : (
            <CodigoVerificacao valor={codigo} onChange={setCodigo} onCompleto={(v) => verificarCodigo(v)} desabilitado={carregando} invalido={erro?.codigo === "codigo_invalido"} />
          )}
          <BotaoPrincipal carregando={carregando} disabled={usarRecuperacao ? codigo.replace(/[^A-Z0-9]/g, "").length < 10 : codigo.length < 6}>
            <ShieldCheck className="h-4 w-4" /> Verificar e entrar
          </BotaoPrincipal>
        </form>
        <div className="mt-6 flex flex-col items-center gap-3 text-sm">
          <button
            onClick={() => {
              setUsarRecuperacao((u) => !u);
              setCodigo("");
              setErro(null);
            }}
            className="font-medium text-brand-700 hover:underline"
          >
            {usarRecuperacao ? "Usar o aplicativo autenticador" : "Perdeu o celular? Use um código de recuperação"}
          </button>
          {desafio && <p className="text-xs text-slate-400">Esta verificação expira às {formatarHora(desafio.expiraEm)}.</p>}
          <button
            onClick={() => {
              setEtapa("senha");
              setSenha("");
              setErro(null);
            }}
            className="flex items-center gap-1 text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </button>
        </div>
      </>
    );
  }

  if (etapa === "senha") {
    return (
      <>
        <Cabecalho titulo="Digite sua senha" />
        <button
          type="button"
          onClick={() => {
            setEtapa("email");
            setErro(null);
          }}
          className="-mt-4 mb-6 flex w-full items-center gap-3 rounded-full border border-slate-200 py-1.5 pl-1.5 pr-4 text-left text-sm text-slate-700 transition hover:bg-slate-50"
          aria-label="Trocar de conta"
        >
          <Avatar nome={email.split("@")[0].replace(/[._-]/g, " ")} tamanho="sm" />
          <span className="flex-1 truncate font-medium">{email}</span>
          <span className="text-xs font-medium text-brand-700">Trocar</span>
        </button>
        {avisoInicial && !erro && <Aviso tom={avisoInicial.tom}>{avisoInicial.texto}</Aviso>}
        {mensagemErro}
        <form onSubmit={entrarComSenha} className="space-y-5">
          {/* Campo oculto para gerenciadores de senha associarem o e-mail à senha. */}
          <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
          <div>
            <Rotulo
              htmlFor="senha"
              extra={
                <Link href={`/esqueci-a-senha?email=${encodeURIComponent(email)}`} className="text-xs font-medium text-brand-700 hover:underline">
                  Esqueceu a senha?
                </Link>
              }
            >
              Senha
            </Rotulo>
            <CampoSenha ref={senhaRef} id="senha" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required invalido={erro?.codigo === "credenciais_invalidas"} />
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 transition hover:bg-slate-50">
            <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
            <span>
              <span className="block text-sm font-medium text-slate-800">Manter conectado por 30 dias</span>
              <span className="block text-xs text-slate-500">Sem esta opção, a sessão termina ao fechar o navegador ou após 8 horas sem uso. Não marque em computadores compartilhados.</span>
            </span>
          </label>
          <BotaoPrincipal carregando={carregando} disabled={!senha || espera > 0}>
            Entrar
          </BotaoPrincipal>
        </form>
      </>
    );
  }

  return (
    <>
      <Cabecalho titulo="Entre na sua conta" subtitulo="Acompanhe suas intimações e prazos em um só lugar." />
      {avisoInicial && <Aviso tom={avisoInicial.tom}>{avisoInicial.texto}</Aviso>}
      <form onSubmit={continuar} className="space-y-4" noValidate>
        <div>
          <Rotulo htmlFor="email">E-mail profissional</Rotulo>
          <CampoTexto
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="nome@escritorio.com.br"
            autoFocus
            invalido={!!erroEmail}
          />
          <ErroCampo>{erroEmail}</ErroCampo>
        </div>
        <BotaoPrincipal>
          Continuar <ArrowRight className="h-4 w-4" aria-hidden />
        </BotaoPrincipal>
      </form>
      <div className="mt-4 text-right">
        <Link href={emailValido(email) ? `/esqueci-a-senha?email=${encodeURIComponent(email)}` : "/esqueci-a-senha"} className="rounded text-sm font-medium text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
          Esqueci minha senha
        </Link>
      </div>
      <div className="my-8 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-slate-500">
        <span className="h-px flex-1 bg-slate-200" /> Novo por aqui? <span className="h-px flex-1 bg-slate-200" />
      </div>
      <Link
        href="/criar-conta"
        className="flex h-12 w-full items-center justify-center rounded-xl px-4 text-[15px] font-semibold text-slate-800 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        Criar uma conta
      </Link>
      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Sessão protegida, sem rastreadores de terceiros.
      </p>
      <LinkCaixaDeSaida className="mt-6" />
    </>
  );
}

export default function PaginaEntrar() {
  return (
    <Suspense>
      <Entrar />
    </Suspense>
  );
}
