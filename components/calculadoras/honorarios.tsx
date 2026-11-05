"use client";

import { useState } from "react";
import { Field, Select } from "@/components/ui";
import { reais } from "@/lib/calculadoras/base";
import { honorariosFazenda, honorariosPercentual } from "@/lib/calculadoras/honorarios";
import { salarioMinimo } from "@/lib/calculadoras/parametros";
import { hojeISO } from "@/lib/utils";
import { AvisoConferencia, CabecalhoCalculadora, CampoNumero, Escolha, Layout, Resultado, Secao } from "./comum";

type Regime = "cpc" | "fazenda" | "trabalhista";

export function CalculadoraHonorarios() {
  const [regime, setRegime] = useState<Regime>("cpc");
  const [base, setBase] = useState<number | null>(null);
  const [perc, setPerc] = useState<number | null>(10);
  const [posicao, setPosicao] = useState("0");
  const [sm, setSm] = useState<number | null>(salarioMinimo(Number(hojeISO().slice(0, 4))));
  const r =
    base === null || base <= 0
      ? null
      : regime === "fazenda"
        ? sm
          ? honorariosFazenda(base, sm, Number(posicao))
          : null
        : honorariosPercentual(base, perc ?? 0, regime);
  return (
    <>
      <CabecalhoCalculadora titulo="Honorários de sucumbência" descricao="Faixas do art. 85 do CPC, inclusive o escalonamento contra a Fazenda Pública, e do art. 791-A da CLT." />
      <Layout
        formulario={
          <>
            <Secao>
              <Escolha
                rotulo="Regime"
                valor={regime}
                onChange={(v) => {
                  setRegime(v);
                  setPerc(v === "trabalhista" ? 5 : 10);
                }}
                opcoes={[
                  { id: "cpc", rotulo: "Cível (CPC)" },
                  { id: "fazenda", rotulo: "Contra a Fazenda Pública" },
                  { id: "trabalhista", rotulo: "Trabalhista" },
                ]}
              />
              <CampoNumero id="base" label="Base de cálculo" prefixo="R$" valor={base} onChange={setBase} hint="Condenação, proveito econômico ou valor atualizado da causa." />
              {regime === "fazenda" ? (
                <>
                  <CampoNumero id="sm" label="Salário mínimo" prefixo="R$" valor={sm} onChange={setSm} hint="O vigente na sentença ou na liquidação (art. 85, § 4º, IV)." />
                  <Field label="Percentual em cada faixa" htmlFor="posicao">
                    <Select id="posicao" value={posicao} onChange={(e) => setPosicao(e.target.value)}>
                      <option value="0">Mínimo de cada faixa</option>
                      <option value="0.5">Meio de cada faixa</option>
                      <option value="1">Máximo de cada faixa</option>
                    </Select>
                  </Field>
                </>
              ) : (
                <CampoNumero id="perc" label="Percentual" sufixo="%" valor={perc} onChange={setPerc} hint={regime === "cpc" ? "Entre 10% e 20% (art. 85, § 2º)." : "Entre 5% e 15% (art. 791-A)."} />
              )}
            </Secao>
            <AvisoConferencia />
          </>
        }
        resultado={
          <Resultado
            titulo="Honorários de sucumbência"
            linhas={r?.linhas ?? null}
            avisos={r?.avisos}
            destaque={r && <p className="text-3xl font-semibold tabular-nums text-slate-900">{reais(r.escolhido)}</p>}
          />
        }
      />
    </>
  );
}
