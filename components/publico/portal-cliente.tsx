"use client";

import { CheckCircle2, Download, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ErroApi } from "@/lib/auth/api";
import type { VisaoPortal } from "@/lib/portal";
import { FASE_LABEL } from "@/lib/processos";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, Spinner, Textarea } from "../ui";

const tamanho = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function Mensagem({ token, portal }: { token: string; portal: VisaoPortal }) {
  const [d, setD] = useState({ assunto: "", mensagem: "", contato: "", processoId: portal.processos.length === 1 ? portal.processos[0].id : "" });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [enviada, setEnviada] = useState(false);

  async function enviar() {
    setEnviando(true);
    setErro(undefined);
    try {
      await api(`/api/portal-publico/${encodeURIComponent(token)}/mensagens`, { body: { ...d, processoId: d.processoId || undefined }, silencioso401: true });
      setEnviada(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Falar com o escritório" subtitle="A mensagem chega à equipe que cuida do seu caso." />
      {enviada ? (
        <div className="flex items-start gap-3 p-5 text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p className="text-sm">Mensagem enviada. O escritório responde pelo contato de sempre.</p>
          <Button size="sm" variant="ghost" onClick={() => (setEnviada(false), setD({ ...d, assunto: "", mensagem: "" }))}>
            Escrever outra
          </Button>
        </div>
      ) : (
        <form
          className="space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          {erro && <Alert>{erro}</Alert>}
          {portal.processos.length > 1 && (
            <Field label="Sobre qual processo" htmlFor="m-processo">
              <Select id="m-processo" value={d.processoId} onChange={(e) => setD({ ...d, processoId: e.target.value })}>
                <option value="">Assunto geral</option>
                {portal.processos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.numero ?? p.rotulo}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Assunto" htmlFor="m-assunto">
            <Input id="m-assunto" value={d.assunto} onChange={(e) => setD({ ...d, assunto: e.target.value })} maxLength={200} />
          </Field>
          <Field label="Mensagem" htmlFor="m-mensagem" required>
            <Textarea id="m-mensagem" rows={4} value={d.mensagem} onChange={(e) => setD({ ...d, mensagem: e.target.value })} maxLength={4000} required />
          </Field>
          <Field label="Contato para resposta (opcional)" htmlFor="m-contato">
            <Input id="m-contato" value={d.contato} onChange={(e) => setD({ ...d, contato: e.target.value })} maxLength={200} placeholder="E-mail ou telefone" />
          </Field>
          <Button type="submit" icon={<MessageSquare className="h-4 w-4" />} loading={enviando} disabled={!d.mensagem.trim()}>
            Enviar
          </Button>
        </form>
      )}
    </Card>
  );
}

/** Portal do cliente: só leitura, com o que o escritório escolheu mostrar. */
export function PortalDoCliente({ token }: { token: string }) {
  const [portal, setPortal] = useState<VisaoPortal>();
  const [erro, setErro] = useState<string>();

  useEffect(() => {
    api<{ portal: VisaoPortal }>(`/api/portal-publico/${encodeURIComponent(token)}`, { silencioso401: true })
      .then((r) => setPortal(r.portal))
      .catch((e) => setErro(e instanceof ErroApi && e.status === 404 ? "Este link expirou ou foi desligado. Peça um novo ao escritório." : e instanceof Error ? e.message : "Não foi possível abrir."));
  }, [token]);

  if (erro) return <Alert>{erro}</Alert>;
  if (!portal) return <Spinner />;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-brand-700">{portal.escritorio}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{portal.titulo}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {portal.cliente} · atualizado em {formatDateTime(portal.geradoEm)} · link válido até {formatDate(portal.expiraEm.slice(0, 10))}
        </p>
        {portal.mensagem && <p className="mt-4 whitespace-pre-wrap rounded-lg border border-brand-100 bg-brand-50/50 p-4 text-sm text-slate-800">{portal.mensagem}</p>}
      </div>

      {!portal.processos.length && <Alert tone="info">Nenhum processo para mostrar agora.</Alert>}

      {portal.processos.map((p) => (
        <Card key={p.id}>
          <CardHeader
            title={p.numero ? <span className="font-mono">{p.numero}</span> : p.rotulo}
            subtitle={[p.numero && p.rotulo, p.classe, p.orgao, p.tribunal].filter(Boolean).join(" · ")}
            action={<Badge>{FASE_LABEL[p.fase]}</Badge>}
          />
          <div className="space-y-5 p-5">
            {p.notas.length > 0 && (
              <section>
                <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">Recados do escritório</h2>
                <ul className="mt-2 space-y-3">
                  {p.notas.map((n, i) => (
                    <li key={i} className="text-sm">
                      <p className="font-medium text-slate-900">
                        {formatDate(n.data)} · {n.titulo}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{n.texto}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {p.andamentos.length > 0 && (
              <section>
                <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">Últimos andamentos no tribunal</h2>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {p.andamentos.map((a, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-24 shrink-0 text-slate-500">{formatDate(a.dataHora.slice(0, 10))}</span>
                      <span className="text-slate-800">{a.nome}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500">Os tribunais informam os andamentos com alguns dias de atraso. Em caso de dúvida, fale com o escritório.</p>
              </section>
            )}
            {p.documentos.length > 0 && (
              <section>
                <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">Documentos</h2>
                <ul className="mt-2 space-y-1">
                  {p.documentos.map((d) => (
                    <li key={d.id}>
                      <a
                        href={`/api/portal-publico/${encodeURIComponent(token)}/documentos/${p.id}/${d.id}`}
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline"
                      >
                        <Download className="h-4 w-4" aria-hidden /> {d.nome} <span className="text-xs text-slate-500">({tamanho(d.tamanho)})</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {!p.notas.length && !p.andamentos.length && !p.documentos.length && <p className="text-sm text-slate-500">Sem novidades para mostrar neste processo.</p>}
          </div>
        </Card>
      ))}

      {portal.permitirMensagens && <Mensagem token={token} portal={portal} />}
    </div>
  );
}
