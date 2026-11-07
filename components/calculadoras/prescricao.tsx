"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { Field, Select } from "@/components/ui";
import { dataBR, dataValida, type Duracao } from "@/lib/calculadoras/base";
import { HIPOTESES, prescricaoCivel, prescricaoPenal, prescricaoTrabalhista, TABELA_ART_109, type ModoPenal } from "@/lib/calculadoras/prescricao";
import { hojeISO } from "@/lib/utils";
import { AvisoConferencia, CabecalhoCalculadora, CampoData, CampoDuracao, CampoInteiro, Escolha, Layout, Opcao, Resultado, Secao } from "./comum";

type Area = "civel" | "trabalhista" | "penal";

function Situacao({ prescrito, dias, data }: { prescrito: boolean; dias: number; data: string }) {
  return (
    <div>
      <p className={clsx("text-3xl font-semibold tabular-nums", prescrito ? "text-red-700" : "text-slate-900")}>{dataBR(data)}</p>
      <p className={clsx("mt-1 text-sm font-medium", prescrito ? "text-red-700" : dias <= 90 ? "text-amber-700" : "text-emerald-700")}>
        {prescrito ? `Prescrito há ${Math.abs(dias)} dia(s)` : dias === 0 ? "Último dia: hoje" : `Faltam ${dias} dia(s)`}
      </p>
    </div>
  );
}

export function CalculadoraPrescricao() {
  const hoje = hojeISO();
  const [area, setArea] = useState<Area>("civel");
  // Cível
  const [hipotese, setHipotese] = useState("reparacao");
  const [termo, setTermo] = useState("");
  const [pandemia, setPandemia] = useState(true);
  // Trabalhista
  const [extincao, setExtincao] = useState("");
  const [vigente, setVigente] = useState(false);
  const [diasAviso, setDiasAviso] = useState(0);
  const [ajuizamento, setAjuizamento] = useState(hoje);
  // Penal
  const [modo, setModo] = useState<ModoPenal>("abstrata");
  const [pena, setPena] = useState<Duracao>({ anos: 0, meses: 0, dias: 0 });
  const [termoPenal, setTermoPenal] = useState("");
  const [fato, setFato] = useState("");
  const [metade, setMetade] = useState(false);
  const [reincidente, setReincidente] = useState(false);
  const [soMulta, setSoMulta] = useState(false);

  const h = HIPOTESES.find((x) => x.id === hipotese)!;
  const grupos = useMemo(() => [...new Set(HIPOTESES.map((x) => x.grupo))], []);

  let conteudo: React.ReactNode;
  if (area === "civel") {
    const r = dataValida(termo) ? prescricaoCivel(h, termo, hoje, { pandemia }) : null;
    conteudo = <Resultado titulo={`Prescrição: ${h.rotulo.toLowerCase()}`} linhas={r?.linhas ?? null} avisos={r?.avisos} destaque={r && <Situacao prescrito={r.prescrito} dias={r.diasRestantes} data={r.prorrogadoPara ?? r.fim} />} vazio="Escolha a pretensão e informe o termo inicial." />;
  } else if (area === "trabalhista") {
    const r = dataValida(ajuizamento) && (vigente || dataValida(extincao)) ? prescricaoTrabalhista(vigente ? null : extincao, ajuizamento, diasAviso) : null;
    conteudo = (
      <Resultado
        titulo="Prescrição trabalhista"
        linhas={r?.linhas ?? null}
        avisos={r?.avisos}
        vazio="Informe a data de extinção do contrato (ou marque que está em vigor)."
        destaque={
          r &&
          (r.limiteBienal ? (
            <Situacao prescrito={!r.bienalOk} dias={Math.round((Date.parse(r.prorrogadoPara ?? r.limiteBienal) - Date.parse(ajuizamento)) / 86_400_000)} data={r.prorrogadoPara ?? r.limiteBienal} />
          ) : (
            <p className="text-sm text-slate-700">Contrato em vigor: só a prescrição quinquenal, a partir de {dataBR(r.marcoQuinquenal)}.</p>
          ))
        }
      />
    );
  } else {
    const temPena = soMulta || pena.anos + pena.meses + pena.dias > 0;
    const r = temPena && dataValida(termoPenal) ? prescricaoPenal({ modo, pena, termoInicial: termoPenal, dataDoFato: dataValida(fato) ? fato : termoPenal, reduzMetade: metade, reincidente, soMulta }, hoje) : null;
    conteudo = (
      <>
        <Resultado titulo="Prescrição penal" linhas={r?.linhas ?? null} avisos={r?.avisos} destaque={r && <Situacao prescrito={r.prescrito} dias={r.diasRestantes} data={r.fim} />} vazio="Informe a pena e o termo inicial." />
        <Secao titulo="Tabela do art. 109 do Código Penal">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="pb-2 font-medium">Pena</th>
                <th className="pb-2 font-medium">Prescreve em</th>
                <th className="pb-2 font-medium">Inciso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {TABELA_ART_109.map((l) => (
                <tr key={l.inciso}>
                  <td className="py-1.5 pr-2 text-slate-700">{l.pena}</td>
                  <td className="py-1.5 pr-2 text-slate-900">{l.prazo}</td>
                  <td className="py-1.5 text-slate-500">{l.inciso}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Secao>
      </>
    );
  }

  return (
    <>
      <CabecalhoCalculadora titulo="Prazo prescricional" descricao="Data em que a pretensão prescreve, com a regra de contagem de cada ramo e as suspensões legais." />
      <Layout
        formulario={
          <>
            <Secao>
              <Escolha
                rotulo="Ramo"
                valor={area}
                onChange={setArea}
                opcoes={[
                  { id: "civel", rotulo: "Cível, consumidor e Fazenda" },
                  { id: "trabalhista", rotulo: "Trabalhista" },
                  { id: "penal", rotulo: "Penal" },
                ]}
              />
              {area === "civel" && (
                <>
                  <Field label="Pretensão" htmlFor="hipotese" hint={`${h.anos} ${h.anos === 1 ? "ano" : "anos"} · ${h.base}`}>
                    <Select id="hipotese" value={hipotese} onChange={(e) => setHipotese(e.target.value)}>
                      {grupos.map((g) => (
                        <optgroup key={g} label={g}>
                          {HIPOTESES.filter((x) => x.grupo === g).map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.rotulo} ({x.anos} {x.anos === 1 ? "ano" : "anos"})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                  </Field>
                  <CampoData id="termo" label="Termo inicial" valor={termo} onChange={setTermo} hint={`${h.termo}. Se houve interrupção (CC, art. 202), use a data do ato interruptivo.`} obrigatorio />
                  {h.privado && <Opcao id="pandemia" label="Aplicar a suspensão da pandemia (12/06 a 30/10/2020)" detalhe="Lei 14.010/2020, art. 3º: vale para relações de direito privado." marcado={pandemia} onChange={setPandemia} />}
                </>
              )}
              {area === "trabalhista" && (
                <>
                  <Opcao id="vigente" label="O contrato ainda está em vigor" marcado={vigente} onChange={setVigente} />
                  {!vigente && (
                    <>
                      <CampoData id="extincao" label="Último dia trabalhado (ou data da dispensa)" valor={extincao} onChange={setExtincao} obrigatorio />
                      <CampoInteiro id="aviso" label="Dias de aviso prévio indenizado a projetar" valor={diasAviso} onChange={setDiasAviso} max={90} hint="30 + 3 por ano completo, até 90 (Lei 12.506/2011). 0 se trabalhado ou não houve." />
                    </>
                  )}
                  <CampoData id="ajuizamento" label="Data do ajuizamento" valor={ajuizamento} onChange={setAjuizamento} hint="Hoje, se a ação ainda não foi proposta." />
                </>
              )}
              {area === "penal" && (
                <>
                  <Field label="Prescrição" htmlFor="modo-penal">
                    <Select id="modo-penal" value={modo} onChange={(e) => setModo(e.target.value as ModoPenal)}>
                      <option value="abstrata">Da pretensão punitiva pela pena máxima (antes da sentença)</option>
                      <option value="concreta">Da pretensão punitiva pela pena aplicada (retroativa ou intercorrente)</option>
                      <option value="executoria">Da pretensão executória (após o trânsito em julgado)</option>
                    </Select>
                  </Field>
                  <Opcao id="multa" label="Pena de multa isolada" marcado={soMulta} onChange={setSoMulta} />
                  {!soMulta && <CampoDuracao id="pena" label={modo === "abstrata" ? "Pena máxima cominada" : "Pena aplicada"} valor={pena} onChange={setPena} hint={modo === "abstrata" ? "Considere as causas de aumento pela fração máxima e as de diminuição pela mínima." : undefined} />}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <CampoData id="fato" label="Data do fato" valor={fato} onChange={setFato} />
                    <CampoData id="termo-penal" label="Termo inicial da contagem" valor={termoPenal} onChange={setTermoPenal} hint={modo === "executoria" ? "Trânsito em julgado para a acusação (art. 112, I)." : "Fato ou último marco interruptivo (art. 117)."} obrigatorio />
                  </div>
                  <Opcao id="metade" label="Menor de 21 na data do fato ou maior de 70 na sentença" detalhe="Prazo pela metade (CP, art. 115)." marcado={metade} onChange={setMetade} />
                  <Opcao id="reincidente" label="Réu reincidente" detalhe="Aumenta 1/3 só na pretensão executória (art. 110)." marcado={reincidente} onChange={setReincidente} />
                </>
              )}
            </Secao>
            <AvisoConferencia />
          </>
        }
        resultado={conteudo}
      />
    </>
  );
}
