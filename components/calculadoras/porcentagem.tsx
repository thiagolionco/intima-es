"use client";

import { useState } from "react";
import { Field, Select } from "@/components/ui";
import { calcularPorcentagem, MODOS_PORCENTAGEM, type ModoPorcentagem } from "@/lib/calculadoras/porcentagem";
import { CabecalhoCalculadora, CampoNumero, Layout, Resultado, Secao } from "./comum";

export function CalculadoraPorcentagem() {
  const [modo, setModo] = useState<ModoPorcentagem>("parte");
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const m = MODOS_PORCENTAGEM.find((x) => x.id === modo)!;
  const r = a !== null && b !== null ? calcularPorcentagem(modo, a, b) : null;
  return (
    <>
      <CabecalhoCalculadora titulo="Porcentagem" descricao="As contas de porcentagem do dia a dia: honorários contratuais, descontos de acordo, reajustes e variações." />
      <Layout
        formulario={
          <Secao>
            <Field label="O que você quer calcular?" htmlFor="modo">
              <Select id="modo" value={modo} onChange={(e) => setModo(e.target.value as ModoPorcentagem)}>
                {MODOS_PORCENTAGEM.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.rotulo}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoNumero id="a" label={m.a} valor={a} onChange={setA} casas={4} />
              <CampoNumero id="b" label={m.b} valor={b} onChange={setB} casas={4} />
            </div>
          </Secao>
        }
        resultado={
          <Resultado
            titulo={m.rotulo}
            linhas={r?.linhas ?? null}
            vazio={a !== null && b !== null ? "Essa conta não existe (divisão por zero)." : undefined}
            destaque={r && <p className="text-3xl font-semibold tabular-nums text-slate-900">{r.texto}</p>}
          />
        }
      />
    </>
  );
}
