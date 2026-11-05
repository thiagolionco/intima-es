"use client";

import { useState } from "react";
import { Field, Select } from "@/components/ui";
import { dataBR, dataValida, emDias, type Duracao } from "@/lib/calculadoras/base";
import { calcularExecucao, FAIXAS_PROGRESSAO, FRACOES_LIVRAMENTO } from "@/lib/calculadoras/execucao-penal";
import { AvisoConferencia, CabecalhoCalculadora, CampoData, CampoDuracao, CampoInteiro, Layout, Resultado, Secao } from "./comum";

export function CalculadoraExecucaoPenal() {
  const [pena, setPena] = useState<Duracao>({ anos: 0, meses: 0, dias: 0 });
  const [dataBase, setDataBase] = useState("");
  const [faixa, setFaixa] = useState("16");
  const [livramento, setLivramento] = useState<string>("terco");
  const [remidos, setRemidos] = useState(0);
  const [detracao, setDetracao] = useState(0);
  const r = emDias(pena) > 0 && dataValida(dataBase) ? calcularExecucao({ pena, dataBase, faixaProgressao: faixa, livramento: livramento || null, diasRemidos: remidos, diasDetracao: detracao }) : null;
  return (
    <>
      <CabecalhoCalculadora titulo="Progressão de regime e livramento condicional" descricao="Frações do art. 112 da LEP (Pacote Anticrime e Lei 14.994/2024) e do art. 83 do CP, com desconto de remição e detração." />
      <Layout
        formulario={
          <>
            <Secao>
              <CampoDuracao id="pena" label="Pena total (ou o restante, após progressão)" valor={pena} onChange={setPena} />
              <CampoData id="data-base" label="Data-base" valor={dataBase} onChange={setDataBase} hint="Prisão, última progressão ou última falta grave." obrigatorio />
              <Field label="Fração para progressão" htmlFor="faixa">
                <Select id="faixa" value={faixa} onChange={(e) => setFaixa(e.target.value)}>
                  {FAIXAS_PROGRESSAO.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.perc.toLocaleString("pt-BR")}%: {f.rotulo} ({f.inciso === "§ 3º" ? "§ 3º" : `inc. ${f.inciso}`})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Livramento condicional" htmlFor="livramento">
                <Select id="livramento" value={livramento} onChange={(e) => setLivramento(e.target.value)}>
                  <option value="">Não calcular</option>
                  {FRACOES_LIVRAMENTO.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.rotulo}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <CampoInteiro id="remidos" label="Dias remidos" valor={remidos} onChange={setRemidos} hint="Trabalho ou estudo (LEP, art. 126)." />
                <CampoInteiro id="detracao" label="Dias de detração" valor={detracao} onChange={setDetracao} hint="Prisão provisória antes da data-base (CP, art. 42)." />
              </div>
            </Secao>
            <AvisoConferencia />
          </>
        }
        resultado={
          <Resultado
            titulo="Execução penal"
            linhas={r?.linhas ?? null}
            avisos={r?.avisos}
            vazio="Informe a pena e a data-base."
            destaque={
              r && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Progressão</p>
                    <p className="text-2xl font-semibold tabular-nums text-slate-900">{dataBR(r.progressao.data)}</p>
                  </div>
                  {r.livramento && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Livramento</p>
                      <p className="text-2xl font-semibold tabular-nums text-slate-900">{dataBR(r.livramento.data)}</p>
                    </div>
                  )}
                </div>
              )
            }
          />
        }
      />
    </>
  );
}
