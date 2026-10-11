"use client";

import { Download, FileJson, FileSpreadsheet, HardDrive, Sparkles, Trash2, Upload } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Button, Card, PageHeader, Spinner } from "@/components/ui";
import { DialogoExportacao } from "@/components/exportacao/dialogo-exportacao";
import { gerarDadosDemo } from "@/lib/demo";
import { IndicadorSincronizacao } from "@/components/auth/indicador-sincronizacao";
import { useStore } from "@/lib/store";
import type { Intimacao, Suspensao, TermoMonitorado } from "@/lib/types";
import { hojeISO } from "@/lib/utils";

function Bloco({ icone, titulo, descricao, children }: { icone: ReactNode; titulo: string; descricao: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icone}</span>
        <div>
          <h2 className="font-semibold text-slate-900">{titulo}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{descricao}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 pt-1">{children}</div>
    </Card>
  );
}

function ehIntimacao(x: unknown): x is Intimacao {
  const o = x as Intimacao;
  return !!o && typeof o.id === "string" && typeof o.dataDisponibilizacao === "string" && typeof o.texto === "string" && Array.isArray(o.partes);
}

export default function DadosPage() {
  const { ready, intimacoes, termos, suspensoes, substituirTudo, salvarSuspensoes } = useStore();
  const { toast } = useToast();
  const arquivo = useRef<HTMLInputElement>(null);
  const [confirmar, setConfirmar] = useState<"limpar" | "demo" | null>(null);
  const [exportando, setExportando] = useState(false);

  if (!ready) return <Spinner />;

  const bytes = new Blob([JSON.stringify(intimacoes), JSON.stringify(termos)]).size;

  function exportarJSON() {
    const conteudo = JSON.stringify({ versao: 1, exportadoEm: new Date().toISOString(), intimacoes, termos, suspensoes }, null, 2);
    const blob = new Blob([conteudo], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-intimacoes-${hojeISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Backup gerado");
  }

  async function importarJSON(f: File) {
    try {
      const json = JSON.parse(await f.text());
      const lista: unknown[] = Array.isArray(json) ? json : json.intimacoes;
      if (!Array.isArray(lista) || !lista.every(ehIntimacao)) throw new Error("Arquivo não reconhecido.");
      const novosTermos = Array.isArray(json.termos) ? (json.termos as TermoMonitorado[]) : undefined;
      substituirTudo(lista as Intimacao[], novosTermos);
      if (Array.isArray(json.suspensoes)) salvarSuspensoes((json.suspensoes as Suspensao[]).filter((s) => s && typeof s.id === "string" && typeof s.inicio === "string" && typeof s.fim === "string"));
      toast("Backup restaurado", { descricao: `${lista.length} intimação(ões)${novosTermos ? ` e ${novosTermos.length} cliente(s)` : ""}.` });
    } catch (e) {
      toast("Não foi possível importar", { tom: "error", descricao: e instanceof Error ? e.message : "Arquivo inválido." });
    } finally {
      if (arquivo.current) arquivo.current.value = "";
    }
  }

  return (
    <>
      <PageHeader title="Dados e backup" description="Seus dados ficam guardados no servidor, isolados na sua conta, e acompanham você em qualquer navegador." />

      <div className="grid gap-4 md:grid-cols-2">
        <Bloco icone={<HardDrive className="h-5 w-5" />} titulo="Seu espaço de trabalho" descricao={`${intimacoes.length} intimação(ões) e ${termos.length} cliente(s), ocupando cerca de ${(bytes / 1024).toFixed(1)} KB.`}>
          <IndicadorSincronizacao />
        </Bloco>

        <Bloco icone={<FileSpreadsheet className="h-5 w-5" />} titulo="Exportar intimações" descricao="Excel, CSV, PDF ou JSON, com escolha de colunas, ordem e formatação.">
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} disabled={!intimacoes.length} onClick={() => setExportando(true)}>
            Abrir exportação
          </Button>
        </Bloco>

        <Bloco icone={<FileJson className="h-5 w-5" />} titulo="Backup completo (JSON)" descricao="Salva intimações e clientes para restaurar depois ou levar para outra conta.">
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportarJSON}>
            Exportar backup
          </Button>
          <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => arquivo.current?.click()}>
            Restaurar backup
          </Button>
          <input ref={arquivo} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importarJSON(e.target.files[0])} />
        </Bloco>

        <Bloco icone={<Sparkles className="h-5 w-5" />} titulo="Dados de demonstração" descricao="Substitui o acervo por 30 intimações fictícias para testar o painel, filtros e exportação.">
          <Button variant="secondary" onClick={() => setConfirmar("demo")}>
            Carregar exemplo
          </Button>
          <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} disabled={!intimacoes.length && !termos.length} onClick={() => setConfirmar("limpar")}>
            Apagar tudo
          </Button>
        </Bloco>
      </div>

      <DialogoExportacao aberto={exportando} onFechar={() => setExportando(false)} conjuntos={[{ id: "todas", rotulo: "Acervo completo", descricao: "Todas as intimações da conta", itens: intimacoes }]} />

      <ConfirmDialog
        open={confirmar === "demo"}
        onClose={() => setConfirmar(null)}
        title="Carregar dados de exemplo?"
        description="As intimações atuais serão substituídas pelos dados fictícios. Os clientes cadastrados também serão substituídos se ainda não houver nenhum."
        confirmLabel="Carregar"
        onConfirm={() => {
          const demo = gerarDadosDemo();
          substituirTudo(demo.intimacoes, termos.length ? undefined : demo.termos);
          toast("Dados de exemplo carregados");
        }}
      />
      <ConfirmDialog
        open={confirmar === "limpar"}
        onClose={() => setConfirmar(null)}
        title="Apagar todos os dados?"
        description="Todas as intimações e clientes da sua conta serão apagados. Considere exportar um backup antes."
        confirmLabel="Apagar tudo"
        onConfirm={() => {
          substituirTudo([], []);
          toast("Dados apagados");
        }}
      />
    </>
  );
}
