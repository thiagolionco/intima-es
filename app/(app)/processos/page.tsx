"use client";

import { FolderOpen, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SeloResponsavel } from "@/components/equipe";
import { Alert, Button, Card, EmptyState, Input, PageHeader, Spinner } from "@/components/ui";
import { digitos, intimacoesDoProcesso, POLO_CLIENTE_LABEL } from "@/lib/processos";
import { useProcessos } from "@/lib/use-processos";
import { useStore } from "@/lib/store";
import { formatDate, formatProcesso, normalizar } from "@/lib/utils";

export default function ProcessosPage() {
  const { ready, intimacoes } = useStore();
  const { processos, erro, carregando } = useProcessos();
  const [busca, setBusca] = useState("");

  const linhas = useMemo(() => {
    const termo = normalizar(busca.trim());
    const termoDigitos = digitos(busca);
    return (processos ?? [])
      .filter((p) => !termo || normalizar([p.cliente, p.parteContraria, p.tribunal, p.orgao, p.classe].join(" ")).includes(termo) || (termoDigitos.length >= 4 && p.numero.includes(termoDigitos)))
      .map((p) => ({ p, ligadas: intimacoesDoProcesso(intimacoes, p.numero) }));
  }, [processos, intimacoes, busca]);

  const acao = (
    <Link href="/processos/novo">
      <Button icon={<Plus className="h-4 w-4" />}>Cadastrar processo</Button>
    </Link>
  );

  return (
    <>
      <PageHeader title="Processos" description="Os processos do escritório, com as intimações de cada um." actions={acao} />
      {erro && <Alert>{erro}</Alert>}
      {!ready || carregando ? (
        <Spinner />
      ) : !processos?.length ? (
        !erro && (
          <Card>
            <EmptyState
              icon={<FolderOpen className="h-6 w-6" />}
              title="Nenhum processo cadastrado"
              description="Cadastre um processo para ver num só lugar os dados dele e as intimações com o mesmo número."
              action={acao}
            />
          </Card>
        )
      ) : (
        <>
          <div className="relative mb-4 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por número, cliente, parte ou tribunal" className="pl-9" aria-label="Buscar processos" />
          </div>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {linhas.map(({ p, ligadas }) => (
                <li key={p.id}>
                  <Link href={`/processos/${p.id}`} className="flex flex-col gap-1 px-5 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-6">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm font-semibold text-slate-900">{formatProcesso(p.numero)}</p>
                      <p className="mt-0.5 truncate text-sm text-slate-700">
                        {p.cliente}
                        {p.parteContraria && <span className="text-slate-500"> × {p.parteContraria}</span>}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{[POLO_CLIENTE_LABEL[p.polo], p.tribunal, p.orgao].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-xs text-slate-500">
                      <SeloResponsavel id={p.responsavelId} />
                      <span>{ligadas.length ? `${ligadas.length} intimação(ões), última em ${formatDate(ligadas[0].dataDisponibilizacao)}` : "Sem intimações"}</span>
                    </div>
                  </Link>
                </li>
              ))}
              {!linhas.length && <li className="px-5 py-6 text-center text-sm text-slate-500">Nenhum processo encontrado para “{busca}”.</li>}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
