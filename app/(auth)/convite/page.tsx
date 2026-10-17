"use client";

import clsx from "clsx";
import { BadgeCheck, Building2, CircleX, Loader2, LogIn, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Aviso, BotaoPrincipal, Cabecalho, ErroCampo, Rotulo } from "@/components/auth/blocos";
import { CampoSenha, CampoTexto, MedidorSenha } from "@/components/auth/campos";
import { api, ErroApi } from "@/lib/auth/api";
import { lerTokenDoFragmento } from "@/lib/auth/fragmento";
import { avaliarSenha } from "@/lib/auth/politica-senha";
import { useSessao } from "@/lib/auth/sessao";
import { DESCRICAO_PAPEL, type PapelNoEscritorio, ROTULO_PAPEL } from "@/lib/escritorio";

interface Consulta {
  escritorio: string;
  email: string;
  papel: PapelNoEscritorio;
  convidadoPor?: string;
  expiraEm: string;
  contaExiste: boolean;
}

/** O token sobrevive à ida para "Entrar" (que não leva o fragmento) só nesta aba. */
const CHAVE = "clepsa:convite";

function guardar(token: string) {
  try {
    sessionStorage.setItem(CHAVE, token);
  } catch {}
}
function lerGuardado(): string {
  try {
    return sessionStorage.getItem(CHAVE) ?? "";
  } catch {
    return "";
  }
}
function esquecer() {
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {}
}

type Estado = { tipo: "verificando" } | { tipo: "erro"; mensagem: string } | { tipo: "aberto"; token: string; c: Consulta } | { tipo: "aceito"; escritorio: string };

/**
 * Destino do link do convite. Quem não tem conta cria a sua aqui (o link já confirma o e-mail);
 * quem tem entra na conta e aceita com um clique.
 */
export default function Convite() {
  const router = useRouter();
  const { estado: sessao, usuario, sair, recarregar } = useSessao();
  const [estado, setEstado] = useState<Estado>({ tipo: "verificando" });
  const [dados, setDados] = useState({ nome: "", oab: "", senha: "", confirmacao: "" });
  const [termos, setTermos] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState("");
  const [enviando, setEnviando] = useState(false);
  const executado = useRef(false);

  useEffect(() => {
    if (executado.current) return;
    executado.current = true;
    const token = lerTokenDoFragmento() || lerGuardado();
    if (!token) return setEstado({ tipo: "erro", mensagem: "O link está incompleto. Abra novamente o link do e-mail." });
    guardar(token);
    api<Consulta>("/api/convite/consultar", { body: { token } })
      .then((c) => setEstado({ tipo: "aberto", token, c }))
      .catch((e) => {
        esquecer();
        setEstado({ tipo: "erro", mensagem: e instanceof Error ? e.message : "Não foi possível abrir o convite." });
      });
  }, []);

  if (estado.tipo === "verificando" || sessao.tipo === "carregando") {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm text-slate-500" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" /> Abrindo o convite…
      </div>
    );
  }

  if (estado.tipo === "erro") {
    return (
      <>
        <Cabecalho icone={<CircleX className="h-6 w-6 text-red-600" />} titulo="Não deu para usar este convite" subtitulo={estado.mensagem} />
        <Link href="/entrar" className="block">
          <BotaoPrincipal>Ir para o Clepsa</BotaoPrincipal>
        </Link>
      </>
    );
  }

  if (estado.tipo === "aceito") {
    return (
      <>
        <Cabecalho icone={<BadgeCheck className="h-6 w-6 text-emerald-600" />} titulo={`Você entrou no escritório ${estado.escritorio}`} subtitulo="As intimações, os prazos e os processos do escritório já aparecem para você." />
        <BotaoPrincipal onClick={() => window.location.assign("/hoje")}>Abrir o Clepsa</BotaoPrincipal>
      </>
    );
  }

  const { c, token } = estado;
  const resumo = (
    <div className="mb-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
      <p className="flex items-center gap-2 font-medium text-slate-900">
        <Building2 className="h-4 w-4 text-brand-600" aria-hidden /> {c.escritorio}
      </p>
      <p className="mt-2">
        Como <strong className="text-slate-800">{ROTULO_PAPEL[c.papel].toLowerCase()}</strong>: {DESCRICAO_PAPEL[c.papel]}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Convite para {c.email}
        {c.convidadoPor ? `, enviado por ${c.convidadoPor}` : ""}.
      </p>
    </div>
  );

  async function aceitarLogado() {
    setEnviando(true);
    setErroGeral("");
    try {
      const r = await api<{ escritorio: string }>("/api/convite/aceitar", { body: { token } });
      esquecer();
      await recarregar();
      setEstado({ tipo: "aceito", escritorio: r.escritorio });
    } catch (e) {
      setErroGeral(e instanceof Error ? e.message : "Não foi possível aceitar o convite.");
    } finally {
      setEnviando(false);
    }
  }

  async function criarConta(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (dados.nome.trim().split(/\s+/).length < 2) er.nome = "Informe nome e sobrenome.";
    if (!avaliarSenha(dados.senha, { email: c.email, nome: dados.nome }).valida) er.senha = "A senha ainda não atende aos requisitos abaixo.";
    if (dados.confirmacao !== dados.senha) er.confirmacao = "As senhas não conferem.";
    if (!termos) er.termos = "É preciso aceitar os termos para continuar.";
    setErros(er);
    if (Object.keys(er).length) return;
    setEnviando(true);
    setErroGeral("");
    try {
      await api("/api/convite/criar-conta", { body: { token, nome: dados.nome, oab: dados.oab, senha: dados.senha, aceitouTermos: true } });
      esquecer();
      router.replace(`/entrar?email=${encodeURIComponent(c.email)}&convite=1`);
    } catch (e) {
      if (e instanceof ErroApi && e.campo) setErros({ [e.campo]: e.message });
      else setErroGeral(e instanceof Error ? e.message : "Não foi possível criar a conta.");
      setEnviando(false);
    }
  }

  // Já tem conta: entra nela (se ainda não entrou) e aceita.
  if (c.contaExiste) {
    const mesmaConta = usuario?.email === c.email;
    return (
      <>
        <Cabecalho icone={<UserPlus className="h-6 w-6 text-brand-600" />} titulo="Convite para o escritório" subtitulo="Aceite para trabalhar no mesmo acervo do escritório." />
        {resumo}
        {erroGeral && <Aviso tom="erro">{erroGeral}</Aviso>}
        {mesmaConta ? (
          <BotaoPrincipal carregando={enviando} onClick={aceitarLogado}>
            Aceitar e entrar no escritório
          </BotaoPrincipal>
        ) : usuario ? (
          <>
            <Aviso tom="info">
              Você está na conta {usuario.email}, mas o convite é para {c.email}. Saia e entre com o e-mail do convite.
            </Aviso>
            <BotaoPrincipal onClick={() => sair()}>Sair desta conta</BotaoPrincipal>
          </>
        ) : (
          <Link href={`/entrar?email=${encodeURIComponent(c.email)}&para=${encodeURIComponent("/convite")}`} className="block">
            <BotaoPrincipal>
              <LogIn className="h-4 w-4" /> Entrar para aceitar
            </BotaoPrincipal>
          </Link>
        )}
      </>
    );
  }

  const set = (campo: keyof typeof dados) => (e: { target: { value: string } }) => {
    setDados((d) => ({ ...d, [campo]: e.target.value }));
    if (erros[campo]) setErros(({ [campo]: _, ...resto }) => resto);
  };

  return (
    <>
      <Cabecalho icone={<UserPlus className="h-6 w-6 text-brand-600" />} titulo="Crie seu acesso ao escritório" subtitulo="Seu login é só seu. O que você fizer fica registrado no seu nome." />
      {resumo}
      {erroGeral && <Aviso tom="erro">{erroGeral}</Aviso>}
      <form onSubmit={criarConta} className="space-y-4" noValidate>
        <div>
          <Rotulo htmlFor="email">E-mail</Rotulo>
          <CampoTexto id="email" value={c.email} disabled readOnly />
        </div>
        <div className="grid grid-cols-5 gap-3">
          <div className="col-span-3">
            <Rotulo htmlFor="nome">Nome completo</Rotulo>
            <CampoTexto id="nome" value={dados.nome} onChange={set("nome")} autoComplete="name" autoFocus invalido={!!erros.nome} />
            <ErroCampo>{erros.nome}</ErroCampo>
          </div>
          <div className="col-span-2">
            <Rotulo htmlFor="oab" extra={<span className="text-xs text-slate-400">opcional</span>}>
              OAB
            </Rotulo>
            <CampoTexto id="oab" value={dados.oab} onChange={set("oab")} placeholder="123456/SP" />
          </div>
        </div>
        <div>
          <Rotulo htmlFor="senha">Senha</Rotulo>
          <CampoSenha id="senha" value={dados.senha} onChange={set("senha")} autoComplete="new-password" invalido={!!erros.senha} />
          <ErroCampo>{erros.senha}</ErroCampo>
          <MedidorSenha senha={dados.senha} email={c.email} nome={dados.nome} />
        </div>
        <div>
          <Rotulo htmlFor="confirmacao">Confirme a senha</Rotulo>
          <CampoSenha id="confirmacao" value={dados.confirmacao} onChange={set("confirmacao")} autoComplete="new-password" invalido={!!erros.confirmacao} />
          <ErroCampo>{erros.confirmacao}</ErroCampo>
        </div>
        <label className={clsx("flex cursor-pointer items-start gap-3 rounded-xl border p-3", erros.termos ? "border-red-300 bg-red-50" : "border-slate-200")}>
          <input
            type="checkbox"
            checked={termos}
            onChange={(e) => {
              setTermos(e.target.checked);
              if (erros.termos) setErros(({ termos: _, ...resto }) => resto);
            }}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
          />
          <span className="text-sm text-slate-600">
            Li e aceito os <strong>termos de uso</strong> e a <strong>política de privacidade</strong>.
          </span>
        </label>
        <ErroCampo>{erros.termos}</ErroCampo>
        <BotaoPrincipal carregando={enviando}>Criar acesso e entrar no escritório</BotaoPrincipal>
      </form>
    </>
  );
}
