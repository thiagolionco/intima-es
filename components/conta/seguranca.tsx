"use client";

import clsx from "clsx";
import { Check, CheckCircle2, Copy, Download, Fingerprint, KeyRound, LifeBuoy, ShieldAlert, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CampoSenha, CodigoVerificacao, MedidorSenha } from "@/components/auth/campos";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, CardHeader, Field } from "@/components/ui";
import { api, ErroApi } from "@/lib/auth/api";
import { avaliarSenha } from "@/lib/auth/politica-senha";
import { useSessao, useUsuario } from "@/lib/auth/sessao";
import { formatDate } from "@/lib/utils";

const UM_ANO = 365 * 24 * 3600 * 1000;

/** Placar de segurança da conta, no estilo de consoles corporativos. */
function PlacarSeguranca() {
  const u = useUsuario();
  const itens = [
    { ok: u.emailConfirmado, texto: "E-mail confirmado" },
    { ok: u.doisFatoresAtivo, texto: "Verificação em duas etapas ativa" },
    { ok: u.doisFatoresAtivo && u.codigosRecuperacaoRestantes >= 3, texto: "Códigos de recuperação disponíveis" },
    { ok: Date.now() - new Date(u.senhaAlteradaEm).getTime() < UM_ANO, texto: "Senha trocada no último ano" },
  ];
  const pontos = itens.filter((i) => i.ok).length;
  const pct = Math.round((pontos / itens.length) * 100);
  const cor = pct === 100 ? "#059669" : pct >= 50 ? "#d97706" : "#dc2626";
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <Card className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
      <div className="relative h-24 w-24 shrink-0">
        <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90" aria-hidden>
          <circle cx="40" cy="40" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
          <circle cx="40" cy="40" r={r} fill="none" stroke={cor} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className="transition-all duration-700" />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold text-slate-900">{pct}%</span>
          <span className="text-[10px] uppercase tracking-wide text-slate-400">proteção</span>
        </span>
      </div>
      <div className="flex-1">
        <h2 className="font-semibold text-slate-900">{pct === 100 ? "Sua conta está muito bem protegida" : "Reforce a proteção da sua conta"}</h2>
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {itens.map((i) => (
            <li key={i.texto} className={clsx("flex items-center gap-2 text-sm", i.ok ? "text-slate-700" : "text-slate-400")}>
              {i.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <ShieldAlert className="h-4 w-4 text-amber-500" />}
              {i.texto}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function AlterarSenha() {
  const u = useUsuario();
  const { recarregar } = useSessao();
  const { toast } = useToast();
  const [f, setF] = useState({ atual: "", nova: "", confirmacao: "" });
  const [erro, setErro] = useState<{ campo?: string; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!avaliarSenha(f.nova, { email: u.email, nome: u.nome }).valida) return setErro({ campo: "nova", texto: "A nova senha não atende aos requisitos." });
    if (f.nova !== f.confirmacao) return setErro({ campo: "confirmacao", texto: "As senhas não coincidem." });
    setSalvando(true);
    setErro(null);
    try {
      const r = await api<{ sessoesEncerradas: number }>("/api/conta/senha", { body: { atual: f.atual, nova: f.nova } });
      setF({ atual: "", nova: "", confirmacao: "" });
      await recarregar();
      toast("Senha alterada", { descricao: r.sessoesEncerradas ? `${r.sessoesEncerradas} outra(s) sessão(ões) foram encerradas.` : "Enviamos um aviso para o seu e-mail." });
    } catch (err) {
      setErro({ campo: err instanceof ErroApi ? err.campo : undefined, texto: err instanceof Error ? err.message : "Erro ao salvar." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Senha" subtitle={`Última alteração em ${formatDate(u.senhaAlteradaEm)}. Ao trocar, as outras sessões são encerradas.`} />
      <form onSubmit={salvar} className="grid gap-4 p-5 md:grid-cols-2">
        <input type="email" name="username" value={u.email} autoComplete="username" readOnly hidden />
        <Field label="Senha atual" htmlFor="s-atual" error={erro?.campo === "atual" ? erro.texto : undefined} className="md:col-span-2 md:max-w-sm">
          <CampoSenha id="s-atual" value={f.atual} onChange={(e) => setF({ ...f, atual: e.target.value })} autoComplete="current-password" required />
        </Field>
        <Field label="Nova senha" htmlFor="s-nova" error={erro?.campo === "nova" || erro?.campo === "senha" ? erro.texto : undefined}>
          <CampoSenha id="s-nova" value={f.nova} onChange={(e) => setF({ ...f, nova: e.target.value })} autoComplete="new-password" required />
        </Field>
        <Field label="Confirme a nova senha" htmlFor="s-conf" error={erro?.campo === "confirmacao" ? erro.texto : undefined}>
          <CampoSenha id="s-conf" value={f.confirmacao} onChange={(e) => setF({ ...f, confirmacao: e.target.value })} autoComplete="new-password" required />
        </Field>
        {f.nova && (
          <div className="md:col-span-2">
            <MedidorSenha senha={f.nova} email={u.email} nome={u.nome} />
          </div>
        )}
        {erro && !erro.campo && (
          <div className="md:col-span-2">
            <Alert>{erro.texto}</Alert>
          </div>
        )}
        <div className="flex justify-end md:col-span-2">
          <Button type="submit" loading={salvando} disabled={!f.atual || !f.nova} icon={<KeyRound className="h-4 w-4" />}>
            Alterar senha
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Lista de códigos de recuperação com copiar e baixar. */
function CodigosRecuperacao({ codigos }: { codigos: string[] }) {
  const u = useUsuario();
  const [copiado, setCopiado] = useState(false);
  const texto = `Controle de Intimações — códigos de recuperação\nConta: ${u.email}\nGerados em: ${new Date().toLocaleString("pt-BR")}\n\nCada código pode ser usado uma única vez.\n\n${codigos.join("\n")}\n`;
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-900 p-4 font-mono text-sm text-slate-100">
        {codigos.map((c) => (
          <span key={c} className="text-center tracking-wider">
            {c}
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="secondary" size="sm" icon={copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={() => navigator.clipboard.writeText(texto).then(() => setCopiado(true))}>
          {copiado ? "Copiados" : "Copiar"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<Download className="h-4 w-4" />}
          onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
            a.download = "codigos-recuperacao-intimacoes.txt";
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          }}
        >
          Baixar .txt
        </Button>
      </div>
    </div>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{titulo}</p>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

/** Assistente de ativação: QR code → código de teste → códigos de recuperação. */
function AssistenteDoisFatores({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { recarregar } = useSessao();
  const { toast } = useToast();
  const [config, setConfig] = useState<{ segredo: string; qr: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [guardei, setGuardei] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const iniciado = useRef(false);

  // Uma única chamada por abertura (o ref evita a chamada dupla do StrictMode).
  useEffect(() => {
    if (!aberto || iniciado.current) return;
    iniciado.current = true;
    api<{ segredo: string; qr: string }>("/api/conta/2fa", { body: {} })
      .then(setConfig)
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível iniciar."));
  }, [aberto]);

  function fechar() {
    if (codigos && !guardei) return;
    iniciado.current = false;
    setConfig(null);
    setCodigo("");
    setCodigos(null);
    setGuardei(false);
    setErro("");
    onFechar();
  }

  async function ativar(valor = codigo) {
    setCarregando(true);
    setErro("");
    try {
      const r = await api<{ codigosRecuperacao: string[] }>("/api/conta/2fa/ativar", { body: { codigo: valor } });
      setCodigos(r.codigosRecuperacao);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Código incorreto.");
      setCodigo("");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Modal
      open={aberto}
      onClose={fechar}
      title={codigos ? "Guarde seus códigos de recuperação" : "Ativar verificação em duas etapas"}
      footer={
        codigos ? (
          <Button
            disabled={!guardei}
            onClick={() => {
              toast("Verificação em duas etapas ativada", { descricao: "Pediremos um código do aplicativo a cada novo login." });
              fechar();
            }}
          >
            Concluir
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={fechar}>
              Cancelar
            </Button>
            <Button onClick={() => ativar()} loading={carregando} disabled={codigo.length < 6}>
              Verificar e ativar
            </Button>
          </>
        )
      }
    >
      {erro && (
        <div className="mb-4">
          <Alert>{erro}</Alert>
        </div>
      )}
      {codigos ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Se você perder o celular, estes códigos são a única forma de entrar. Cada um vale uma vez. Guarde-os num gerenciador de senhas ou impressos em local seguro.</p>
          <CodigosRecuperacao codigos={codigos} />
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={guardei} onChange={(e) => setGuardei(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
            Guardei meus códigos em local seguro
          </label>
        </div>
      ) : (
        <div className="space-y-6">
          <Passo n={1} titulo="Escaneie o QR code com o aplicativo autenticador">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="flex h-[180px] w-[180px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {config ? <img src={config.qr} alt="QR code para o aplicativo autenticador" className="h-full w-full" /> : <span className="text-xs text-slate-400">Gerando…</span>}
              </div>
              <div className="text-xs text-slate-500">
                <p>Google Authenticator, Microsoft Authenticator, Authy ou 1Password.</p>
                <p className="mt-3">Não consegue escanear? Digite esta chave:</p>
                <code className="mt-1 block break-all rounded-lg bg-slate-100 px-2 py-1.5 font-mono text-[12px] text-slate-800">{config?.segredo.replace(/(.{4})/g, "$1 ").trim() ?? "…"}</code>
              </div>
            </div>
          </Passo>
          <Passo n={2} titulo="Digite o código de 6 dígitos que aparece no aplicativo">
            <CodigoVerificacao valor={codigo} onChange={setCodigo} onCompleto={(v) => ativar(v)} desabilitado={!config || carregando} invalido={!!erro} />
          </Passo>
        </div>
      )}
    </Modal>
  );
}

/** Pede a senha antes de uma ação sensível (desativar 2FA, regenerar códigos). */
function ConfirmarComSenha({ aberto, titulo, descricao, rotuloAcao, perigo, onFechar, onConfirmar }: { aberto: boolean; titulo: string; descricao: string; rotuloAcao: string; perigo?: boolean; onFechar: () => void; onConfirmar: (senha: string) => Promise<void> }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const fechar = () => {
    setSenha("");
    setErro("");
    onFechar();
  };
  return (
    <Modal
      open={aberto}
      onClose={fechar}
      title={titulo}
      footer={
        <>
          <Button variant="secondary" onClick={fechar}>
            Cancelar
          </Button>
          <Button
            variant={perigo ? "danger" : "primary"}
            loading={carregando}
            disabled={!senha}
            onClick={async () => {
              setCarregando(true);
              setErro("");
              try {
                await onConfirmar(senha);
                setSenha("");
              } catch (e) {
                setErro(e instanceof Error ? e.message : "Erro.");
              } finally {
                setCarregando(false);
              }
            }}
          >
            {rotuloAcao}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-600">{descricao}</p>
      <Field label="Confirme sua senha" htmlFor="conf-senha" error={erro}>
        <CampoSenha id="conf-senha" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" autoFocus />
      </Field>
    </Modal>
  );
}

function DoisFatores() {
  const u = useUsuario();
  const { recarregar } = useSessao();
  const { toast } = useToast();
  const [assistente, setAssistente] = useState(false);
  const [acao, setAcao] = useState<"desativar" | "regenerar" | null>(null);
  const [novosCodigos, setNovosCodigos] = useState<string[] | null>(null);

  return (
    <Card>
      <CardHeader
        title="Verificação em duas etapas"
        subtitle="Além da senha, um código temporário do seu celular. Impede o acesso mesmo que a senha vaze."
        action={
          u.doisFatoresAtivo ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" /> Ativa
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
              <ShieldAlert className="h-3.5 w-3.5" /> Desativada
            </span>
          )
        }
      />
      <div className="divide-y divide-slate-100">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <Smartphone className="hidden h-8 w-8 shrink-0 rounded-lg bg-slate-100 p-1.5 text-slate-500 sm:block" />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900">Aplicativo autenticador</p>
            <p className="text-sm text-slate-500">{u.doisFatoresAtivo ? "Configurado. Códigos de 6 dígitos renovados a cada 30 segundos." : "Recomendado para todas as contas que lidam com dados de clientes."}</p>
          </div>
          {u.doisFatoresAtivo ? (
            <Button variant="secondary" onClick={() => setAcao("desativar")}>
              Desativar
            </Button>
          ) : (
            <Button icon={<Fingerprint className="h-4 w-4" />} onClick={() => setAssistente(true)}>
              Ativar agora
            </Button>
          )}
        </div>
        {u.doisFatoresAtivo && (
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
            <LifeBuoy className="hidden h-8 w-8 shrink-0 rounded-lg bg-slate-100 p-1.5 text-slate-500 sm:block" />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">Códigos de recuperação</p>
              <p className={clsx("text-sm", u.codigosRecuperacaoRestantes < 3 ? "font-medium text-amber-700" : "text-slate-500")}>
                {u.codigosRecuperacaoRestantes} de 10 disponíveis{u.codigosRecuperacaoRestantes < 3 ? " — gere novos códigos" : ""}.
              </p>
            </div>
            <Button variant="secondary" onClick={() => setAcao("regenerar")}>
              Gerar novos códigos
            </Button>
          </div>
        )}
      </div>

      <AssistenteDoisFatores aberto={assistente} onFechar={() => setAssistente(false)} />
      <ConfirmarComSenha
        aberto={acao === "desativar"}
        titulo="Desativar verificação em duas etapas?"
        descricao="Sua conta voltará a ser protegida apenas pela senha. Os códigos de recuperação deixarão de valer."
        rotuloAcao="Desativar"
        perigo
        onFechar={() => setAcao(null)}
        onConfirmar={async (senha) => {
          await api("/api/conta/2fa/desativar", { body: { senha } });
          await recarregar();
          setAcao(null);
          toast("Verificação em duas etapas desativada", { tom: "info" });
        }}
      />
      <ConfirmarComSenha
        aberto={acao === "regenerar"}
        titulo="Gerar novos códigos de recuperação"
        descricao="Os códigos atuais deixarão de funcionar imediatamente."
        rotuloAcao="Gerar códigos"
        onFechar={() => setAcao(null)}
        onConfirmar={async (senha) => {
          const r = await api<{ codigosRecuperacao: string[] }>("/api/conta/2fa/codigos", { body: { senha } });
          await recarregar();
          setAcao(null);
          setNovosCodigos(r.codigosRecuperacao);
        }}
      />
      <Modal open={!!novosCodigos} onClose={() => setNovosCodigos(null)} title="Novos códigos de recuperação" footer={<Button onClick={() => setNovosCodigos(null)}>Pronto</Button>}>
        <p className="mb-4 text-sm text-slate-600">Guarde-os agora: por segurança, não os mostraremos novamente.</p>
        {novosCodigos && <CodigosRecuperacao codigos={novosCodigos} />}
      </Modal>
    </Card>
  );
}

export function AbaSeguranca() {
  return (
    <div className="space-y-6">
      <PlacarSeguranca />
      <DoisFatores />
      <AlterarSenha />
    </div>
  );
}
