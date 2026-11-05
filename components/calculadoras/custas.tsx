"use client";

import { useState } from "react";
import { reais } from "@/lib/calculadoras/base";
import { custasJusticaDoTrabalho, custasJusticaFederal } from "@/lib/calculadoras/custas";
import { hojeISO } from "@/lib/utils";
import { AvisoConferencia, CabecalhoCalculadora, CampoNumero, Escolha, Layout, Resultado, Secao } from "./comum";

export function CalculadoraCustas() {
  const [justica, setJustica] = useState<"federal" | "trabalho">("federal");
  const [valor, setValor] = useState<number | null>(null);
  const ano = Number(hojeISO().slice(0, 4));
  const r = valor && valor > 0 ? (justica === "federal" ? custasJusticaFederal(valor) : custasJusticaDoTrabalho(valor, ano)) : null;
  return (
    <>
      <CabecalhoCalculadora titulo="Custas judiciais" descricao="Custas da Justiça Federal e da Justiça do Trabalho, que seguem lei federal. As custas estaduais variam por estado: consulte a tabela do seu tribunal." />
      <Layout
        formulario={
          <>
            <Secao>
              <Escolha
                rotulo="Justiça"
                valor={justica}
                onChange={setJustica}
                opcoes={[
                  { id: "federal", rotulo: "Justiça Federal (ações cíveis)" },
                  { id: "trabalho", rotulo: "Justiça do Trabalho" },
                ]}
              />
              <CampoNumero id="valor" label={justica === "federal" ? "Valor da causa" : "Valor da condenação, do acordo ou da causa"} prefixo="R$" valor={valor} onChange={setValor} />
            </Secao>
            <AvisoConferencia />
          </>
        }
        resultado={<Resultado titulo="Custas" linhas={r?.linhas ?? null} avisos={r?.avisos} destaque={r && <p className="text-3xl font-semibold tabular-nums text-slate-900">{reais(r.total)}</p>} />}
      />
    </>
  );
}
