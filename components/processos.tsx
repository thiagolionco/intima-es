"use client";

import { FileX } from "lucide-react";
import Link from "next/link";
import { Button, Card, EmptyState } from "./ui";

/** Processo que não existe, foi excluído ou não é do escritório (ou falha ao carregar, com `mensagem`). */
export function ProcessoNaoEncontrado({ mensagem }: { mensagem?: string }) {
  return (
    <Card>
      <EmptyState
        icon={<FileX className="h-6 w-6" />}
        title={mensagem ? "Não foi possível abrir o processo" : "Processo não encontrado"}
        description={mensagem ?? "Ele pode ter sido excluído."}
        action={
          <Link href="/processos">
            <Button variant="secondary">Voltar à lista</Button>
          </Link>
        }
      />
    </Card>
  );
}
