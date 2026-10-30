"use client";

import clsx from "clsx";
import { RotateCcw } from "lucide-react";
import { useDicas } from "@/components/dicas";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader } from "@/components/ui";

export function AbaPreferencias() {
  const { ligadas, ligar, recomecar } = useDicas();
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Dicas das telas"
          subtitle="Um balão que explica cada funcionalidade na primeira vez que você a abre. Vale para este navegador."
          action={
            <button
              role="switch"
              aria-checked={ligadas}
              aria-label={ligadas ? "Desligar dicas" : "Ligar dicas"}
              onClick={() => {
                ligar(!ligadas);
                toast(ligadas ? "Dicas desligadas" : "Dicas ligadas");
              }}
              className={clsx("relative h-6 w-11 shrink-0 rounded-full transition", ligadas ? "bg-brand-600" : "bg-slate-300")}
            >
              <span className={clsx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", ligadas ? "left-[22px]" : "left-0.5")} />
            </button>
          }
        />
        <div className="flex flex-col gap-3 px-5 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>Já viu as dicas e quer rever? Elas voltam a aparecer, uma vez em cada tela.</p>
          <Button
            variant="secondary"
            size="sm"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={() => {
              recomecar();
              toast("Dicas reiniciadas", { descricao: "Elas aparecem de novo ao abrir cada tela." });
            }}
          >
            Mostrar todas de novo
          </Button>
        </div>
      </Card>
    </div>
  );
}
