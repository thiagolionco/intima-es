"use client";

import { FolderOpen, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SeloResponsavel } from "@/components/equipe";
import { AbasProcessos } from "@/components/quadro-processos";
import { Alert, Button, Card, EmptyState, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { AREA_LABEL, type AreaAtuacao, digitos, formatarValor, intimacoesDoProcesso, POLO_CLIENTE_LABEL } from "@/lib/processos";
import { useProcessos } from "@/lib/use-processos";
import { useStore } from "@/lib/store";
import { formatDate, formatProcesso, normalizar } from "@/lib/utils";

export default function ProtocoladosPage() {
  const router = useRouter();
  const { ready, intimacoes } = useStore();
  const { processos, ultimas, erro, carregando } = useProcessos();
  const [busca, setBusca] = useState("");
  const [area, setArea] = useState<AreaAtuacao | "">("");

  const protocolados = useMemo(() => (processos ?? []).filter((p) => p.fase === "protocolado"), [processos]);

  const linhas = useMemo(() => {
    const termo = normalizar(busca.trim());
    const termoDigitos = digitos(busca);
    return protocolados
      .filter(
        (p) =>
          (!termo ||
            normalizar([p.cliente, p.parteContraria, p.tribunal, p.orgao, p.comarca, p.classe].join(" ")).includes(termo) ||
            (termoDigitos.length >= 4 && !!p.numero?.includes(termoDigitos))) &&
          (!area || p.area === area),
      )
      .sort((a, b) => (b.dataProtocolo ?? b.criadoEm).localeCompare(a.dataProtocolo ?? a.criadoEm))
      .map((p) => ({ p, ligadas: intimacoesDoProcesso(intimacoes, p.numero) }));
  }, [protocolados, intimacoes, busca, area]);

  const acao = (
    <Link href="/processos/novo?fase=protocolado">
      <Button icon={<Plus className="h-4 w-4" />}>Cadastrar processo</Button>
    </Link>
  );

  return (
    <>
      <PageHeader title="Processos" description="Os processos já protocolados, com as intimações e os andamentos de cada um." actions={acao} />
      <AbasProcessos atual="protocolados" contagem={processos ? { andamento: processos.length - protocolados.length, protocolados: protocolados.length } : undefined} />
      {erro && <Alert>{erro}</Alert>}
      {!ready || carregando ? (
        <Spinner />
      ) : !protocolados.length ? (
        !erro && (
          <Card>
            <EmptyState
              icon={<FolderOpen className="h-6 w-6" />}
              title="Nenhum processo protocolado"
              description="Quando um caso do quadro for protocolado, ele aparece aqui com o número, a vara e o valor da causa."
              action={acao}
            />
          </Card>
        )
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:max-w-md sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por número, parte, vara ou comarca" className="pl-9" aria-label="Buscar processos" />
            </div>
            <Select value={area} onChange={(e) => setArea(e.target.value as AreaAtuacao | "")} className="sm:w-48" aria-label="Filtrar por área">
              <option value="">Todas as áreas</option>
              {(Object.keys(AREA_LABEL) as AreaAtuacao[]).map((a) => (
                <option key={a} value={a}>
                  {AREA_LABEL[a]}
                </option>
              ))}
            </Select>
          </div>

          {/* Tabela em telas largas; em telas estreitas, cada processo vira um cartão. */}
          <Card className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Processo</th>
                  <th className="px-4 py-3 font-medium">Partes</th>
                  <th className="px-4 py-3 font-medium">Área</th>
                  <th className="px-4 py-3 font-medium">Vara e comarca</th>
                  <th className="px-4 py-3 text-right font-medium">Valor da causa</th>
                  <th className="px-4 py-3 font-medium">Responsável</th>
                  <th className="px-4 py-3 font-medium">Último andamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linhas.map(({ p, ligadas }) => (
                  <tr key={p.id} className="cursor-pointer align-top transition hover:bg-slate-50" onClick={() => router.push(`/processos/${p.id}`)}>
                    <td className="px-4 py-3">
                      <Link href={`/processos/${p.id}`} className="whitespace-nowrap font-mono text-sm font-semibold text-slate-900 hover:underline" onClick={(e) => e.stopPropagation()}>
                        {p.numero ? formatProcesso(p.numero) : "Sem número"}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">Protocolado em {formatDate(p.dataProtocolo)}</p>
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <p className="text-slate-800">{p.cliente}</p>
                      {p.parteContraria && <p className="text-slate-500">× {p.parteContraria}</p>}
                      <p className="mt-0.5 text-xs text-slate-400">{POLO_CLIENTE_LABEL[p.polo]}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{p.area ? AREA_LABEL[p.area] : "—"}</td>
                    <td className="max-w-[14rem] px-4 py-3 text-slate-700">
                      <p>{p.orgao || "—"}</p>
                      <p className="text-xs text-slate-500">{[p.comarca, p.tribunal].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-700">{formatarValor(p.valorCausa) || "—"}</td>
                    <td className="px-4 py-3">
                      <SeloResponsavel id={p.responsavelId} />
                    </td>
                    <td className="max-w-[16rem] px-4 py-3 text-xs text-slate-600">
                      {ultimas[p.id] ? (
                        <p className="line-clamp-2" title={ultimas[p.id].nome}>
                          {new Date(ultimas[p.id].dataHora).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}: {ultimas[p.id].nome}
                        </p>
                      ) : (
                        <p className="text-slate-400">—</p>
                      )}
                      {ligadas.length > 0 && <p className="mt-0.5 text-slate-400">{ligadas.length} intimação(ões)</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!linhas.length && <p className="px-5 py-6 text-center text-sm text-slate-500">Nenhum processo encontrado.</p>}
          </Card>

          <Card className="overflow-hidden lg:hidden">
            <ul className="divide-y divide-slate-100">
              {linhas.map(({ p, ligadas }) => (
                <li key={p.id}>
                  <Link href={`/processos/${p.id}`} className="block px-4 py-3 transition hover:bg-slate-50">
                    <p className="truncate font-mono text-sm font-semibold text-slate-900">{p.numero ? formatProcesso(p.numero) : "Sem número"}</p>
                    <p className="mt-0.5 truncate text-sm text-slate-700">
                      {p.cliente}
                      {p.parteContraria && <span className="text-slate-500"> × {p.parteContraria}</span>}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{[p.area && AREA_LABEL[p.area], p.orgao, p.comarca, formatarValor(p.valorCausa)].filter(Boolean).join(" · ")}</p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>Protocolado em {formatDate(p.dataProtocolo)}</span>
                      <SeloResponsavel id={p.responsavelId} />
                    </div>
                    {(ultimas[p.id] || ligadas.length > 0) && (
                      <p className="mt-1 truncate text-xs text-slate-500">{ultimas[p.id] ? `Andamento: ${ultimas[p.id].nome}` : `${ligadas.length} intimação(ões)`}</p>
                    )}
                  </Link>
                </li>
              ))}
              {!linhas.length && <li className="px-5 py-6 text-center text-sm text-slate-500">Nenhum processo encontrado.</li>}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
