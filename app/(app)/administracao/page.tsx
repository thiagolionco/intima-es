"use client";

import clsx from "clsx";
import { Search, ShieldCheck, ShieldOff, UserCheck, UserX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Avatar } from "@/components/auth/menu-usuario";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, CardHeader, EmptyState, Input, PageHeader, Spinner } from "@/components/ui";
import { api, ErroApi } from "@/lib/auth/api";
import { useUsuario } from "@/lib/auth/sessao";
import { formatDate } from "@/lib/utils";

interface Conta {
  id: string;
  nome: string;
  email: string;
  oab?: string;
  escritorios: { escritorioId: string; nome: string; papel: string }[];
  administrador: boolean;
  ativa: boolean;
  desativadaEm?: string;
  emailConfirmado: boolean;
  doisFatoresAtivo: boolean;
  bloqueadaAte?: string;
  criadaEm: string;
  voceMesmo: boolean;
}

type Acao = { conta: Conta; tipo: "desativar" | "reativar" | "conceder" | "retirar" };

const PAPEIS: Record<string, string> = { dono: "Dono", membro: "Membro" };

const TEXTOS: Record<Acao["tipo"], { titulo: string; botao: string; descricao: (c: Conta) => string; feito: string }> = {
  desativar: {
    titulo: "Desativar conta",
    botao: "Desativar",
    descricao: (c) => `${c.nome} sai na hora de todos os dispositivos e não consegue mais entrar. As buscas automáticas e os avisos por e-mail dessa conta param. Nenhum dado é apagado, e você pode reativar depois.`,
    feito: "Conta desativada",
  },
  reativar: {
    titulo: "Reativar conta",
    botao: "Reativar",
    descricao: (c) => `${c.nome} volta a poder entrar, e as rotinas automáticas da conta voltam a rodar.`,
    feito: "Conta reativada",
  },
  conceder: {
    titulo: "Tornar administrador",
    botao: "Tornar administrador",
    descricao: (c) => `${c.nome} passa a ver esta área, com as contas de todos os escritórios, e a poder desativar contas e mudar quem é administrador.`,
    feito: "Acesso de administrador concedido",
  },
  retirar: {
    titulo: "Retirar administração",
    botao: "Retirar",
    descricao: (c) => `${c.nome} deixa de ver esta área e volta a ter só o acesso ao próprio escritório.`,
    feito: "Acesso de administrador retirado",
  },
};

function Selo({ tom, children }: { tom: "verde" | "ambar" | "vermelho" | "marca"; children: ReactNode }) {
  const cores = { verde: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", ambar: "bg-amber-50 text-amber-700 ring-amber-600/20", vermelho: "bg-red-50 text-red-700 ring-red-600/20", marca: "bg-brand-50 text-brand-700 ring-brand-600/20" };
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", cores[tom])}>{children}</span>;
}

function Situacao({ c }: { c: Conta }) {
  if (!c.ativa) return <Selo tom="vermelho">Desativada{c.desativadaEm ? ` em ${formatDate(c.desativadaEm)}` : ""}</Selo>;
  if (!c.emailConfirmado) return <Selo tom="ambar">E-mail não confirmado</Selo>;
  if (c.bloqueadaAte) return <Selo tom="ambar">Bloqueada por senhas erradas</Selo>;
  return <Selo tom="verde">Ativa</Selo>;
}

export default function AdministracaoPage() {
  const usuario = useUsuario();
  const { toast } = useToast();
  const [contas, setContas] = useState<Conta[] | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [acao, setAcao] = useState<Acao | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ contas: Conta[] }>("/api/admin/usuarios");
      setContas(r.contas);
      setErro("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar as contas.");
    }
  }, []);

  useEffect(() => {
    if (usuario.administrador) carregar();
  }, [usuario.administrador, carregar]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!contas || !termo) return contas ?? [];
    return contas.filter((c) => [c.nome, c.email, c.oab ?? "", ...c.escritorios.map((e) => e.nome)].some((t) => t.toLowerCase().includes(termo)));
  }, [contas, busca]);

  async function executar({ conta, tipo }: Acao) {
    setSalvando(conta.id);
    try {
      const corpo = tipo === "desativar" ? { ativa: false } : tipo === "reativar" ? { ativa: true } : { administrador: tipo === "conceder" };
      await api(`/api/admin/usuarios/${conta.id}`, { method: "PATCH", body: corpo });
      toast(TEXTOS[tipo].feito, { descricao: conta.nome });
      await carregar();
    } catch (e) {
      toast("Não foi possível alterar a conta", { descricao: e instanceof ErroApi ? e.message : undefined, tom: "error" });
    } finally {
      setSalvando(null);
    }
  }

  if (!usuario.administrador) {
    return (
      <>
        <PageHeader title="Administração" />
        <Alert tone="warning" title="Sem acesso">
          Esta área é só para a administração da Clepsa.
        </Alert>
      </>
    );
  }

  const total = contas?.length ?? 0;
  const ativas = contas?.filter((c) => c.ativa).length ?? 0;
  const admins = contas?.filter((c) => c.administrador).length ?? 0;

  return (
    <>
      <PageHeader
        title="Administração"
        description="Todas as contas da Clepsa, de todos os escritórios. Só administradores veem esta página; contas comuns continuam enxergando apenas o próprio escritório."
      />

      {erro && (
        <div className="mb-4">
          <Alert title="Erro">{erro}</Alert>
        </div>
      )}

      <Card>
        <CardHeader
          title="Contas"
          subtitle={contas ? `${total} conta(s) · ${ativas} ativa(s) · ${admins} administrador(es)` : undefined}
          action={
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input aria-label="Buscar conta" placeholder="Nome, e-mail, OAB ou escritório" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
            </div>
          }
        />
        {!contas && !erro ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : filtradas.length === 0 ? (
          <EmptyState icon={<Search className="h-6 w-6" />} title="Nenhuma conta encontrada" description={busca ? "Tente outro termo de busca." : undefined} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtradas.map((c) => (
              <li key={c.id} className={clsx("flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4", !c.ativa && "bg-slate-50/60")}>
                <div className={clsx(!c.ativa && "opacity-50")}>
                  <Avatar nome={c.nome} />
                </div>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                    <span className="truncate">{c.nome}</span>
                    {c.voceMesmo && <span className="text-xs font-normal text-slate-500">(você)</span>}
                    {c.administrador && (
                      <Selo tom="marca">
                        <ShieldCheck className="h-3 w-3" aria-hidden />
                        Administrador
                      </Selo>
                    )}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {c.email}
                    {c.oab ? ` · OAB ${c.oab}` : ""} · desde {formatDate(c.criadaEm)}
                    {c.doisFatoresAtivo ? " · duas etapas ativa" : ""}
                  </p>
                </div>
                <div className="w-full min-w-0 shrink-0 text-sm sm:w-56">
                  {c.escritorios.length ? (
                    c.escritorios.map((e) => (
                      <p key={e.escritorioId} className="truncate text-slate-700">
                        {e.nome} <span className="text-xs text-slate-500">· {PAPEIS[e.papel] ?? e.papel}</span>
                      </p>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400">Sem escritório</p>
                  )}
                </div>
                <div className="shrink-0 sm:w-48">
                  <Situacao c={c} />
                </div>
                <div className="ml-auto flex shrink-0 gap-1 sm:w-64 sm:justify-end">
                  {c.voceMesmo ? (
                    <span className="px-3 text-xs text-slate-400">Sua conta</span>
                  ) : (
                    <>
                      {c.ativa && (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={salvando === c.id}
                          icon={c.administrador ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                          onClick={() => setAcao({ conta: c, tipo: c.administrador ? "retirar" : "conceder" })}
                        >
                          {c.administrador ? "Retirar admin" : "Tornar admin"}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={salvando === c.id}
                        className={c.ativa ? "text-red-600 hover:bg-red-50 hover:text-red-700" : undefined}
                        icon={c.ativa ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        onClick={() => setAcao({ conta: c, tipo: c.ativa ? "desativar" : "reativar" })}
                      >
                        {c.ativa ? "Desativar" : "Reativar"}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {acao && (
        <ConfirmDialog
          open
          onClose={() => setAcao(null)}
          onConfirm={() => executar(acao)}
          title={TEXTOS[acao.tipo].titulo}
          description={TEXTOS[acao.tipo].descricao(acao.conta)}
          confirmLabel={TEXTOS[acao.tipo].botao}
        />
      )}
    </>
  );
}
