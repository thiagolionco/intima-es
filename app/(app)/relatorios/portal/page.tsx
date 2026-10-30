"use client";

import clsx from "clsx";
import { CalendarPlus, Copy, Globe, Plus, ShieldOff, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AbasClientes } from "@/components/abas-rota";
import { ConfirmDialog, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea } from "@/components/ui";
import { api } from "@/lib/auth/api";
import { LIMITES_PORTAL, linkAtivo, type LinkPortal, mesmoCliente } from "@/lib/portal";
import { type DocumentoProcesso, type Processo, referencia } from "@/lib/processos";
import { useStore } from "@/lib/store";
import { mensagemDe, useApi } from "@/lib/use-api";
import { useProcessos } from "@/lib/use-processos";
import { formatDate, formatDateTime, formatProcesso } from "@/lib/utils";

/** Clientes com processos que podem ir ao portal (os particulares não vão). */
function clientesDosProcessos(processos: Processo[]): string[] {
  const nomes: string[] = [];
  for (const p of processos) if (!p.particular && p.cliente.trim() && !nomes.some((n) => mesmoCliente(n, p.cliente))) nomes.push(p.cliente.trim());
  return nomes.sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function NovoLink({ aberto, cliente, processos, onFechar, onCriado }: { aberto: boolean; cliente: string; processos: Processo[]; onFechar: () => void; onCriado: (link: LinkPortal, url: string) => void }) {
  const { toast } = useToast();
  const doCliente = useMemo(() => processos.filter((p) => !p.particular && mesmoCliente(p.cliente, cliente)), [processos, cliente]);
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [docs, setDocs] = useState<Record<string, DocumentoProcesso[]>>({});
  const [documentoIds, setDocumentoIds] = useState<string[]>([]);
  const [andamentos, setAndamentos] = useState(true);
  const [mensagens, setMensagens] = useState(true);
  const [dias, setDias] = useState<number>(LIMITES_PORTAL.diasPadrao);
  const [salvando, setSalvando] = useState(false);

  const alvos = escolhidos.length ? doCliente.filter((p) => escolhidos.includes(p.id)) : doCliente;

  // PDFs dos processos mostrados, para escolher o que o cliente pode baixar (cada lista é pedida uma vez).
  const pedidos = useRef(new Set<string>());
  const chaveAlvos = alvos.map((p) => p.id).join(",");
  useEffect(() => {
    if (!aberto) return;
    for (const id of chaveAlvos.split(",").filter(Boolean)) {
      if (pedidos.current.has(id)) continue;
      pedidos.current.add(id);
      void api<{ documentos: DocumentoProcesso[] }>(`/api/processos/${id}/documentos`)
        .then((r) => setDocs((d) => ({ ...d, [id]: r.documentos })))
        .catch(() => setDocs((d) => ({ ...d, [id]: [] })));
    }
  }, [aberto, chaveAlvos]);

  async function criar() {
    setSalvando(true);
    try {
      const permitidos = new Set(alvos.flatMap((p) => (docs[p.id] ?? []).map((d) => d.id)));
      const r = await api<{ link: LinkPortal; token: string }>("/api/portal", {
        body: { cliente, titulo: titulo || undefined, mensagem: mensagem || undefined, processoIds: escolhidos, documentoIds: documentoIds.filter((id) => permitidos.has(id)), mostrarAndamentos: andamentos, permitirMensagens: mensagens, dias },
      });
      onCriado(r.link, `${window.location.origin}/portal/${r.token}`);
      onFechar();
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={aberto}
      onClose={() => !salvando && onFechar()}
      title={`Portal para ${cliente}`}
      footer={
        <>
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button loading={salvando} onClick={() => void criar()}>
            Criar link
          </Button>
        </>
      }
    >
      <div className="-mx-5 max-h-[70vh] space-y-4 overflow-y-auto px-5">
        <Field label="Título" htmlFor="portal-titulo">
          <Input id="portal-titulo" value={titulo} maxLength={LIMITES_PORTAL.titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={`Acompanhamento de ${cliente}`} />
        </Field>
        <Field label="Recado para o cliente (opcional)" htmlFor="portal-mensagem">
          <Textarea id="portal-mensagem" rows={3} value={mensagem} maxLength={LIMITES_PORTAL.mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Ex.: aqui você acompanha seus processos. Qualquer dúvida, mande mensagem por esta página." />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Processos mostrados</legend>
          <p className="mb-2 text-xs text-slate-500">Sem nenhum marcado, o portal mostra todos os processos deste cliente, inclusive os que forem cadastrados depois.</p>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {doCliente.map((p) => (
              <li key={p.id}>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                    checked={escolhidos.includes(p.id)}
                    onChange={(e) => setEscolhidos(e.target.checked ? [...escolhidos, p.id] : escolhidos.filter((x) => x !== p.id))}
                  />
                  <span>
                    {referencia(p)} <span className="font-mono text-xs text-slate-500">{p.numero ? formatProcesso(p.numero) : "sem número"}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">PDFs que o cliente pode baixar</legend>
          {alvos.every((p) => docs[p.id] && !docs[p.id].length) ? (
            <p className="text-xs text-slate-500">Nenhum PDF anexado a estes processos.</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {alvos.flatMap((p) =>
                (docs[p.id] ?? []).map((d) => (
                  <li key={d.id}>
                    <label className="flex items-start gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                        checked={documentoIds.includes(d.id)}
                        onChange={(e) => setDocumentoIds(e.target.checked ? [...documentoIds, d.id] : documentoIds.filter((x) => x !== d.id))}
                      />
                      <span>
                        {d.nome} <span className="text-xs text-slate-500">· {referencia(p)}</span>
                      </span>
                    </label>
                  </li>
                )),
              )}
            </ul>
          )}
          <p className="mt-1 text-xs text-slate-500">Nenhum PDF vai sem ser marcado. Pareceres e análises internas nunca aparecem no portal.</p>
        </fieldset>
        <div className="space-y-2 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={andamentos} onChange={(e) => setAndamentos(e.target.checked)} />
            Mostrar os andamentos do tribunal (DataJud)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={mensagens} onChange={(e) => setMensagens(e.target.checked)} />
            Deixar o cliente mandar mensagens (chegam em Pedidos)
          </label>
        </div>
        <Field label="Válido por" htmlFor="portal-dias">
          <Select id="portal-dias" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            {[30, 90, 180, 365].map((d) => (
              <option key={d} value={d}>
                {d} dias
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-xs text-slate-500">Os recados da linha do tempo marcados como “visível ao cliente” também aparecem.</p>
      </div>
    </Modal>
  );
}

export default function PortalPage() {
  const { toast } = useToast();
  const { compartilhaExterno } = useStore();
  const { processos } = useProcessos();
  const { dados, erro, setDados } = useApi<{ links: LinkPortal[] }>("/api/portal");
  const clientes = useMemo(() => clientesDosProcessos(processos ?? []), [processos]);
  const [cliente, setCliente] = useState("");
  const [novo, setNovo] = useState(false);
  const [criado, setCriado] = useState<string>();
  const [revogar, setRevogar] = useState<LinkPortal>();
  const [excluir, setExcluir] = useState<LinkPortal>();
  const escolhido = cliente || clientes[0] || "";
  const agora = new Date();

  const trocar = (l: LinkPortal) => setDados((d) => d && { links: d.links.map((x) => (x.id === l.id ? l : x)) });

  async function prorrogar(l: LinkPortal) {
    try {
      trocar((await api<{ link: LinkPortal }>(`/api/portal/${l.id}`, { method: "PATCH", body: { dias: LIMITES_PORTAL.diasPadrao } })).link);
      toast(`Válido por mais ${LIMITES_PORTAL.diasPadrao} dias`);
    } catch (e) {
      toast(mensagemDe(e), { tom: "error" });
    }
  }

  return (
    <>
      <PageHeader
        title="Clientes e portal"
        description="Um link para o cliente acompanhar os processos dele sem criar conta: fase, andamentos, recados do escritório e os PDFs que vocês escolherem. Só leitura, com validade e desligável a qualquer hora."
        actions={
          compartilhaExterno && (
            <Button icon={<Plus className="h-4 w-4" />} disabled={!escolhido} onClick={() => setNovo(true)}>
              Novo link
            </Button>
          )
        }
      />
      <AbasClientes atual="portal" />

      {!compartilhaExterno && (
        <div className="mb-4">
          <Alert tone="info">Só o dono e os advogados do escritório criam e desligam links do portal.</Alert>
        </div>
      )}

      {criado && (
        <div className="mb-6">
          <Alert tone="info" title="Copie o link agora e mande ao cliente">
            <p className="break-all font-mono text-xs">{criado}</p>
            <p className="mt-1">Por segurança, o Clepsa guarda só uma impressão digital do link e não consegue mostrá-lo de novo. Se perder, crie outro e desligue este.</p>
            <Button size="sm" variant="secondary" className="mt-2" icon={<Copy className="h-4 w-4" />} onClick={() => void navigator.clipboard.writeText(criado).then(() => toast("Link copiado"))}>
              Copiar link
            </Button>
          </Alert>
        </div>
      )}

      {erro ? (
        <Alert>{erro}</Alert>
      ) : !dados || !processos ? (
        <Spinner />
      ) : !clientes.length ? (
        <Card>
          <EmptyState icon={<Globe className="h-6 w-6" />} title="Nenhum cliente com processo" description="O portal mostra processos cadastrados em Processos. Cadastre o primeiro e volte aqui." />
        </Card>
      ) : (
        <>
          <div className="mb-4 max-w-sm">
            <Field label="Cliente" htmlFor="portal-cliente">
              <Select id="portal-cliente" value={escolhido} onChange={(e) => setCliente(e.target.value)}>
                {clientes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Card>
            <CardHeader title="Links do portal" subtitle="De todos os clientes, do mais novo para o mais antigo." />
            {!dados.links.length ? (
              <p className="px-5 py-4 text-sm text-slate-500">Nenhum link ainda.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {dados.links.map((l) => {
                  const ativo = linkAtivo(l, agora);
                  return (
                    <li key={l.id} className={clsx("flex flex-wrap items-start justify-between gap-3 px-5 py-3", !ativo && "opacity-60")}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {l.titulo} <span className="font-normal text-slate-500">· {l.cliente}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {l.processoIds.length ? `${l.processoIds.length} processo(s)` : "Todos os processos do cliente"} · {l.documentoIds.length} PDF(s) ·{" "}
                          {l.acessos ? `${l.acessos} acesso(s), o último em ${formatDateTime(l.ultimoAcesso)}` : "ainda não aberto"}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <Badge className={ativo ? "bg-emerald-50 text-emerald-700" : undefined}>
                            {l.revogadoEm ? `Desligado em ${formatDate(l.revogadoEm.slice(0, 10))}` : ativo ? `Válido até ${formatDate(l.expiraEm.slice(0, 10))}` : "Expirado"}
                          </Badge>
                          {l.permitirMensagens && <Badge>Recebe mensagens</Badge>}
                        </div>
                      </div>
                      {compartilhaExterno && (
                        <div className="flex shrink-0 gap-1">
                          {!l.revogadoEm && (
                            <Button size="sm" variant="ghost" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => void prorrogar(l)}>
                              Prorrogar
                            </Button>
                          )}
                          {ativo && (
                            <Button size="sm" variant="ghost" icon={<ShieldOff className="h-4 w-4" />} onClick={() => setRevogar(l)}>
                              Desligar
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-red-600" aria-label="Excluir link" icon={<Trash2 className="h-4 w-4" />} onClick={() => setExcluir(l)} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}

      {escolhido && (
        <NovoLink
          aberto={novo}
          cliente={escolhido}
          processos={processos ?? []}
          onFechar={() => setNovo(false)}
          onCriado={(link, url) => {
            setDados((d) => d && { links: [link, ...d.links] });
            setCriado(url);
          }}
        />
      )}
      <ConfirmDialog
        open={!!revogar}
        onClose={() => setRevogar(undefined)}
        title="Desligar este link?"
        description="Quem tiver o link deixa de ver na hora. Não dá para religar: se precisar, crie outro."
        onConfirm={async () => {
          if (!revogar) return;
          try {
            trocar((await api<{ link: LinkPortal }>(`/api/portal/${revogar.id}`, { method: "PATCH", body: { revogar: true } })).link);
          } catch (e) {
            toast(mensagemDe(e), { tom: "error" });
          }
        }}
      />
      <ConfirmDialog
        open={!!excluir}
        onClose={() => setExcluir(undefined)}
        title="Excluir este link?"
        description="O link para de funcionar e some da lista, com o histórico de acessos."
        onConfirm={async () => {
          if (!excluir) return;
          try {
            await api(`/api/portal/${excluir.id}`, { method: "DELETE" });
            setDados((d) => d && { links: d.links.filter((x) => x.id !== excluir.id) });
          } catch (e) {
            toast(mensagemDe(e), { tom: "error" });
          }
        }}
      />
    </>
  );
}
