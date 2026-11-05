"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { reais } from "@/lib/calculadoras/base";
import { atualizar, cumprimentoDeSentenca } from "@/lib/calculadoras/juros";
import { hojeISO } from "@/lib/utils";
import { AvisoConferencia, CabecalhoCalculadora, CampoData, CampoNumero, Escolha, Layout, Opcao, Resultado, Secao } from "./comum";

export function CalculadoraAtualizacao() {
  const [aba, setAba] = useState<"atualizacao" | "cumprimento">("atualizacao");
  const [principal, setPrincipal] = useState<number | null>(null);
  const [fator, setFator] = useState<number | null>(1);
  const [juros, setJuros] = useState<number | null>(1);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState(hojeISO());
  const [sobreCorrigido, setSobreCorrigido] = useState(true);
  const [debito, setDebito] = useState<number | null>(null);
  const [pago, setPago] = useState<number | null>(null);

  const r =
    aba === "atualizacao"
      ? principal && principal > 0 && fator && fator > 0
        ? atualizar({ principal, fator, jurosMes: juros ?? 0, jurosDe: de || undefined, jurosAte: ate || undefined, jurosSobreCorrigido: sobreCorrigido })
        : null
      : debito && debito > 0
        ? cumprimentoDeSentenca(debito, pago ?? 0)
        : null;

  return (
    <>
      <CabecalhoCalculadora titulo="Atualização, juros e cumprimento de sentença" descricao="Correção pelo fator do índice, juros de mora simples dia a dia e os acréscimos de 10% + 10% do art. 523 do CPC." />
      <Layout
        formulario={
          <>
            <Secao>
              <Escolha
                rotulo="Cálculo"
                valor={aba}
                onChange={setAba}
                opcoes={[
                  { id: "atualizacao", rotulo: "Correção e juros" },
                  { id: "cumprimento", rotulo: "Multa e honorários do art. 523" },
                ]}
              />
              {aba === "atualizacao" ? (
                <>
                  <CampoNumero id="principal" label="Valor original" prefixo="R$" valor={principal} onChange={setPrincipal} />
                  <CampoNumero
                    id="fator"
                    label="Fator de correção acumulado"
                    valor={fator}
                    onChange={setFator}
                    casas={7}
                    hint="1 = sem correção. Pegue o fator na tabela do tribunal ou na Calculadora do Cidadão do Banco Central (IPCA, INPC, IGP-M)."
                  />
                  <a href="https://www3.bcb.gov.br/CALCIDADAO/publico/exibirFormCorrecaoValores.do?method=exibirFormCorrecaoValores" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
                    Abrir a Calculadora do Cidadão <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                  <CampoNumero id="juros" label="Juros de mora" sufixo="% a.m." valor={juros} onChange={setJuros} casas={4} hint="1% ao mês até 29/08/2024; depois, a taxa legal (Selic − IPCA) do mês." />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <CampoData id="de" label="Juros desde" valor={de} onChange={setDe} hint="Citação, evento danoso ou vencimento." />
                    <CampoData id="ate" label="Até" valor={ate} onChange={setAte} />
                  </div>
                  <Opcao id="sobre" label="Juros sobre o valor corrigido" marcado={sobreCorrigido} onChange={setSobreCorrigido} />
                </>
              ) : (
                <>
                  <CampoNumero id="debito" label="Débito atualizado" prefixo="R$" valor={debito} onChange={setDebito} />
                  <CampoNumero id="pago" label="Valor pago no prazo de 15 dias (se houve)" prefixo="R$" valor={pago} onChange={setPago} />
                </>
              )}
            </Secao>
            <AvisoConferencia />
          </>
        }
        resultado={<Resultado titulo={aba === "atualizacao" ? "Atualização" : "Cumprimento de sentença"} linhas={r?.linhas ?? null} avisos={r?.avisos} destaque={r && <p className="text-3xl font-semibold tabular-nums text-slate-900">{reais(r.total)}</p>} />}
      />
    </>
  );
}
