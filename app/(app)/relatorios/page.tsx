"use client";

import { Copy, FileText, Printer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AbasClientes } from "@/components/abas-rota";
import { DatePicker } from "@/components/date-picker";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, EmptyState, Field, PageHeader, Select, Spinner } from "@/components/ui";
import { useSessao } from "@/lib/auth/sessao";
import { dataBR } from "@/lib/prazos/datas";
import { gerarHtmlRelatorioCliente, gerarTextoRelatorioCliente, montarRelatorioCliente } from "@/lib/relatorio-cliente";
import { useStore } from "@/lib/store";
import { addDays, hojeISO } from "@/lib/utils";

type Periodo = "mes_passado" | "este_mes" | "30_dias" | "personalizado";

function intervalo(p: Periodo, hoje: string): { inicio: string; fim: string } {
  const primeiroDoMes = `${hoje.slice(0, 7)}-01`;
  if (p === "este_mes") return { inicio: primeiroDoMes, fim: hoje };
  if (p === "30_dias") return { inicio: addDays(hoje, -29), fim: hoje };
  const fimMesPassado = addDays(primeiroDoMes, -1);
  return { inicio: `${fimMesPassado.slice(0, 7)}-01`, fim: fimMesPassado };
}

function Relatorios() {
  const { ready, intimacoes, termos, equipe } = useStore();
  const { usuario } = useSessao();
  const { toast } = useToast();
  const params = useSearchParams();
  const hoje = hojeISO();

  const clientes = useMemo(() => [...new Set([...intimacoes.map((i) => i.cliente), ...termos.map((t) => t.apelido)].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [intimacoes, termos]);
  const [cliente, setCliente] = useState(params.get("cliente") ?? "");
  const [periodo, setPeriodo] = useState<Periodo>("mes_passado");
  const [personalizado, setPersonalizado] = useState(() => intervalo("mes_passado", hoje));
  const [incluirResponsavel, setIncluirResponsavel] = useState(false);
  const [incluirObservacoes, setIncluirObservacoes] = useState(false);
  const [incluirVencidos, setIncluirVencidos] = useState(false);

  const escolhido = cliente || clientes[0] || "";
  const { inicio, fim } = periodo === "personalizado" ? personalizado : intervalo(periodo, hoje);
  const r = useMemo(
    () => (escolhido && inicio && fim && inicio <= fim ? montarRelatorioCliente(intimacoes, { cliente: escolhido, inicio, fim, hoje, equipe, incluirResponsavel, incluirObservacoes }) : null),
    [intimacoes, escolhido, inicio, fim, hoje, equipe, incluirResponsavel, incluirObservacoes],
  );

  // Prazos vencidos aparecem aqui para o escritório, mas só vão para o cliente se marcado.
  const paraCliente = r && (incluirVencidos ? r : { ...r, vencidos: [] });

  function imprimir() {
    if (!paraCliente) return;
    const blob = new Blob([gerarHtmlRelatorioCliente(paraCliente, { escritorio: usuario?.escritorio, geradoEm: new Date().toLocaleString("pt-BR") })], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    if (!window.open(url, "_blank")) toast("Permita pop-ups para gerar o PDF", { tom: "error", descricao: "O navegador bloqueou a janela do relatório." });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function copiar() {
    if (!paraCliente) return;
    try {
      await navigator.clipboard.writeText(gerarTextoRelatorioCliente(paraCliente));
      toast("Resumo copiado", { descricao: "Cole no corpo do e-mail para o cliente." });
    } catch {
      toast("Não foi possível copiar", { tom: "error" });
    }
  }

  if (!ready) return <Spinner />;
  if (!clientes.length) {
    return (
      <>
        <PageHeader title="Clientes e portal" />
        <AbasClientes atual="relatorio" />
        <Card>
          <EmptyState icon={<FileText className="h-6 w-6" />} title="Nenhum cliente ainda" description="Os relatórios aparecem quando houver intimações vinculadas a um cliente." />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Clientes e portal"
        description="Prestação de contas do período para mandar ao cliente: o que foi publicado, o que já foi feito e os próximos prazos. Para o cliente acompanhar sozinho, use o Portal do cliente."
        actions={
          <>
            <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={copiar} disabled={!r}>
              Copiar para e-mail
            </Button>
            <Button icon={<Printer className="h-4 w-4" />} onClick={imprimir} disabled={!r}>
              Gerar PDF
            </Button>
          </>
        }
      />

      <AbasClientes atual="relatorio" />

      <Card className="mb-6">
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Cliente" htmlFor="rel-cliente">
            <Select id="rel-cliente" value={escolhido} onChange={(e) => setCliente(e.target.value)}>
              {clientes.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Período" htmlFor="rel-periodo">
            <Select id="rel-periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
              <option value="mes_passado">Mês passado</option>
              <option value="este_mes">Este mês</option>
              <option value="30_dias">Últimos 30 dias</option>
              <option value="personalizado">Escolher datas</option>
            </Select>
          </Field>
          {periodo === "personalizado" ? (
            <>
              <Field label="De" htmlFor="rel-inicio">
                <DatePicker id="rel-inicio" value={personalizado.inicio} onChange={(v) => setPersonalizado((p) => ({ ...p, inicio: v }))} />
              </Field>
              <Field label="Até" htmlFor="rel-fim" error={inicio > fim ? "Antes do início." : undefined}>
                <DatePicker id="rel-fim" value={personalizado.fim} onChange={(v) => setPersonalizado((p) => ({ ...p, fim: v }))} min={personalizado.inicio || undefined} />
              </Field>
            </>
          ) : (
            <p className="self-end pb-2 text-sm text-slate-500 lg:col-span-2">
              {dataBR(inicio)} a {dataBR(fim)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 px-5 py-3 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={incluirResponsavel} onChange={(e) => setIncluirResponsavel(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
            Mostrar o responsável
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={incluirObservacoes} onChange={(e) => setIncluirObservacoes(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
            Incluir observações internas
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={incluirVencidos} onChange={(e) => setIncluirVencidos(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
            Incluir prazos vencidos
          </label>
        </div>
      </Card>

      {r && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {(
              [
                [r.totais.recebidas, "Intimações no período"],
                [r.totais.processos, "Processos com movimento"],
                [r.totais.respondidas, "Com providência tomada"],
                [r.totais.emAberto, "Em andamento"],
              ] as const
            ).map(([n, rotulo]) => (
              <Card key={rotulo} className="px-5 py-4">
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{n}</p>
                <p className="text-xs text-slate-500">{rotulo}</p>
              </Card>
            ))}
          </div>

          {(r.vencidos.length > 0 || r.proximosPrazos.length > 0) && (
            <Card className="mb-6">
              <CardHeader title="Prazos" subtitle="Em aberto, de qualquer período" />
              <ul className="divide-y divide-slate-100 text-sm">
                {[...r.vencidos.map((p) => ({ ...p, vencido: true })), ...r.proximosPrazos.map((p) => ({ ...p, vencido: false }))].map((p) => (
                  <li key={`${p.processo}-${p.data}-${p.tipo}`} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                    <span className={p.vencido ? "w-24 font-semibold text-red-600" : "w-24 font-medium text-slate-800"}>{dataBR(p.data)}</span>
                    <span className="font-mono text-xs text-slate-700">{p.processo}</span>
                    <span className="text-slate-500">{p.tipo}</span>
                    {p.vencido && <span className="text-xs font-medium text-red-600">vencido{incluirVencidos ? "" : " · não vai no relatório"}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Intimações do período" subtitle={`${r.linhas.length} registro(s), na ordem de publicação`} />
            {r.linhas.length ? (
              <ul className="divide-y divide-slate-100">
                {r.linhas.map((l, k) => (
                  <li key={k} className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[6rem_1fr_8rem]">
                    <span className="text-slate-500">{dataBR(l.data)}</span>
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-medium text-slate-800">
                        {l.processo} <span className="font-sans font-normal text-slate-400">· {l.tipo}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-line text-slate-700">{l.descricao}</p>
                      {l.observacoes && <p className="mt-1 text-xs text-slate-500">Obs.: {l.observacoes}</p>}
                    </div>
                    <div className="text-xs text-slate-500 sm:text-right">
                      <p className="font-medium text-slate-700">{l.situacao}</p>
                      {l.prazo && <p>Prazo {dataBR(l.prazo)}</p>}
                      {l.responsavel && <p>{l.responsavel}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<FileText className="h-6 w-6" />} title="Nada publicado no período" description="Escolha outro período ou outro cliente." />
            )}
          </Card>
        </>
      )}
    </>
  );
}

export default function RelatoriosPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Relatorios />
    </Suspense>
  );
}
