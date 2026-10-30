"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ErroApi } from "@/lib/auth/api";
import { LIMITES_PEDIDO } from "@/lib/pedidos";
import { Alert, Button, Card, Field, Input, Spinner, Textarea } from "../ui";

type Formulario = { escritorio: string; titulo: string; apresentacao?: string };

/** Formulário público de atendimento: quem preenche vira um pedido na caixa do escritório. */
export function FormularioPedidoPublico({ token }: { token: string }) {
  const [form, setForm] = useState<Formulario | null>();
  const [erroCarga, setErroCarga] = useState<string>();
  const [d, setD] = useState({ nome: "", contato: "", assunto: "", descricao: "", aceite: false, site: "" });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    api<{ formulario: Formulario }>(`/api/pedido-publico/${encodeURIComponent(token)}`, { silencioso401: true })
      .then((r) => setForm(r.formulario))
      .catch((e) => setErroCarga(e instanceof ErroApi && e.status === 404 ? "Este link não está mais ativo. Fale com o escritório por outro canal." : e instanceof Error ? e.message : "Não foi possível abrir o formulário."));
  }, [token]);

  async function enviar() {
    setEnviando(true);
    setErro(undefined);
    try {
      await api(`/api/pedido-publico/${encodeURIComponent(token)}`, { body: d, silencioso401: true });
      setEnviado(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (erroCarga) return <Alert>{erroCarga}</Alert>;
  if (!form) return <Spinner />;

  return (
    <Card>
      <div className="space-y-5 p-6 sm:p-8">
        <div>
          <p className="text-sm font-medium text-brand-700">{form.escritorio}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{form.titulo}</h1>
          {form.apresentacao && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{form.apresentacao}</p>}
        </div>
        {enviado ? (
          <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-4 text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <p className="text-sm">Recebemos o seu pedido. O escritório vai responder pelo contato que você deixou.</p>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void enviar();
            }}
          >
            {erro && <Alert>{erro}</Alert>}
            <Field label="Seu nome" htmlFor="p-nome" required>
              <Input id="p-nome" autoComplete="name" value={d.nome} maxLength={LIMITES_PEDIDO.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} required />
            </Field>
            <Field label="E-mail ou telefone para resposta" htmlFor="p-contato" required>
              <Input id="p-contato" autoComplete="email" value={d.contato} maxLength={LIMITES_PEDIDO.contato} onChange={(e) => setD({ ...d, contato: e.target.value })} required />
            </Field>
            <Field label="Assunto" htmlFor="p-assunto">
              <Input id="p-assunto" value={d.assunto} maxLength={LIMITES_PEDIDO.assunto} onChange={(e) => setD({ ...d, assunto: e.target.value })} placeholder="Ex.: cobrança indevida do banco" />
            </Field>
            <Field label="Conte o que aconteceu" htmlFor="p-descricao" required hint="Datas, valores e o que você já tentou ajudam o advogado a responder mais rápido. Não envie senhas nem documentos por aqui.">
              <Textarea id="p-descricao" rows={7} value={d.descricao} maxLength={LIMITES_PEDIDO.descricao} onChange={(e) => setD({ ...d, descricao: e.target.value })} required />
            </Field>
            {/* Campo isca: invisível para pessoas; robôs que preenchem tudo são descartados. */}
            <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
              <label htmlFor="p-site">Site</label>
              <input id="p-site" tabIndex={-1} autoComplete="off" value={d.site} onChange={(e) => setD({ ...d, site: e.target.value })} />
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" checked={d.aceite} onChange={(e) => setD({ ...d, aceite: e.target.checked })} />
              <span>
                Autorizo {form.escritorio} a usar estes dados só para analisar e responder ao meu pedido, conforme a LGPD. Enviar não cria contrato nem relação de advogado e cliente.
              </span>
            </label>
            <Button type="submit" loading={enviando} disabled={!d.aceite || !d.nome.trim() || !d.contato.trim() || !d.descricao.trim()} className="w-full sm:w-auto">
              Enviar pedido
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}
