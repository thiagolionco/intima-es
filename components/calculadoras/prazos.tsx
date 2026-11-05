"use client";

import { useMemo, useState } from "react";
import { Field, Select } from "@/components/ui";
import { dataBR, dataValida } from "@/lib/calculadoras/base";
import { PRAZO_EM_DOBRO, PRAZOS_COMUNS } from "@/lib/calculadoras/prazos";
import { calcularPrazo } from "@/lib/prazos/calculo";
import { Calendario } from "@/lib/prazos/calendario";
import { NOMES_DIAS, diaDaSemana } from "@/lib/prazos/datas";
import { GRUPOS_TRIBUNAIS } from "@/lib/prazos/tribunais";
import { useStore } from "@/lib/store";
import type { ContagemPrazo } from "@/lib/types";
import type { Linha } from "@/lib/calculadoras/base";
import { AvisoConferencia, CabecalhoCalculadora, CampoData, CampoInteiro, Escolha, Layout, Opcao, Resultado, Secao } from "./comum";

export function CalculadoraPrazos() {
  const { suspensoes } = useStore();
  const [data, setData] = useState("");
  const [marco, setMarco] = useState<"disponibilizacao" | "intimacao">("disponibilizacao");
  const [modelo, setModelo] = useState("cpc-contestacao");
  const [dias, setDias] = useState(15);
  const [contagem, setContagem] = useState<ContagemPrazo>("uteis");
  const [dobro, setDobro] = useState(false);
  const [tribunal, setTribunal] = useState("");
  const p = PRAZOS_COMUNS.find((x) => x.id === modelo);

  const calendario = useMemo(() => new Calendario(tribunal, suspensoes), [tribunal, suspensoes]);
  const r = dataValida(data) && dias >= 1 ? calcularPrazo(data, { dias, contagem, dobro }, calendario, marco) : null;
  const linhas: Linha[] | null = r && [
    ...(p ? [{ rotulo: "Prazo", valor: `${p.rotulo}: ${p.dias} dias`, base: p.base }] : []),
    { rotulo: marco === "disponibilizacao" ? "Disponibilização no DJEN" : "Intimação ou ciência", valor: dataBR(data) },
    ...(marco === "disponibilizacao" ? [{ rotulo: "Publicação", valor: dataBR(r.publicacao), conta: "primeiro dia útil seguinte (fins de semana, feriados e recesso de 20/12 a 20/01 não contam)", base: "Lei 11.419/2006, art. 4º, § 3º; CPC, art. 220; CLT, art. 775-A" }] : r.publicacao !== data ? [{ rotulo: "Intimação considerada feita em", valor: dataBR(r.publicacao), conta: "dia sem expediente", base: "Lei 11.419/2006, art. 5º, § 2º" }] : []),
    { rotulo: "Início da contagem", valor: dataBR(r.inicio), base: marco === "disponibilizacao" ? "Lei 11.419/2006, art. 4º, § 4º; CPC, art. 224" : "CPC, art. 224; Súmula 310 do STF" },
    { rotulo: "Dias contados", valor: `${r.dias} ${contagem === "uteis" ? "dias úteis" : "dias corridos"}${dobro ? " (em dobro)" : ""}`, base: contagem === "uteis" ? "CPC, art. 219; CLT, art. 775" : "CPP, art. 798" },
    ...(r.finsDeSemana ? [{ rotulo: "Fins de semana pulados", valor: String(r.finsDeSemana) }] : []),
    ...r.pulados.map((x) => ({ rotulo: `Sem contagem: ${dataBR(x.data)}`, valor: x.motivo })),
    ...(r.prorrogadoDe ? [{ rotulo: "Último dia sem expediente", valor: `${dataBR(r.prorrogadoDe)} → dia útil seguinte`, base: "CPP, art. 798, § 3º" }] : []),
    { rotulo: "Vencimento", valor: `${dataBR(r.fim)} (${NOMES_DIAS[diaDaSemana(r.fim)]})`, destaque: true },
  ];

  return (
    <>
      <CabecalhoCalculadora titulo="Prazo processual" descricao="Usa o mesmo calendário da aba Prazos: feriados nacionais, recesso, Lei 5.010 na Justiça Federal e os dias sem contagem que o escritório cadastrou." />
      <Layout
        formulario={
          <>
            <Secao>
              <Field label="Prazo" htmlFor="modelo">
                <Select
                  id="modelo"
                  value={modelo}
                  onChange={(e) => {
                    setModelo(e.target.value);
                    const x = PRAZOS_COMUNS.find((y) => y.id === e.target.value);
                    if (x) {
                      setDias(x.dias);
                      setContagem(x.contagem);
                    }
                  }}
                >
                  {(["CPC", "CLT", "CPP", "Juizados"] as const).map((g) => (
                    <optgroup key={g} label={g}>
                      {PRAZOS_COMUNS.filter((x) => x.grupo === g).map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.rotulo} ({x.dias} dias)
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value="outro">Outro prazo</option>
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <CampoInteiro id="dias" label="Dias" valor={dias} onChange={setDias} min={1} max={365} />
                <Field label="Contagem" htmlFor="contagem">
                  <Select id="contagem" value={contagem} onChange={(e) => setContagem(e.target.value as ContagemPrazo)}>
                    <option value="uteis">Dias úteis (CPC e CLT)</option>
                    <option value="corridos">Dias corridos (CPP)</option>
                  </Select>
                </Field>
              </div>
              <Escolha
                rotulo="A data informada é"
                valor={marco}
                onChange={setMarco}
                opcoes={[
                  { id: "disponibilizacao", rotulo: "Disponibilização no DJEN" },
                  { id: "intimacao", rotulo: "Intimação ou ciência" },
                ]}
              />
              <CampoData id="data" label={marco === "disponibilizacao" ? "Data da disponibilização" : "Data da intimação"} valor={data} onChange={setData} obrigatorio />
              <Field label="Tribunal" htmlFor="tribunal" hint="Para a Lei 5.010 (Justiça Federal) e as suspensões cadastradas para o tribunal.">
                <Select id="tribunal" value={tribunal} onChange={(e) => setTribunal(e.target.value)}>
                  <option value="">Só feriados nacionais</option>
                  {GRUPOS_TRIBUNAIS.map((g) => (
                    <optgroup key={g.nome} label={g.nome}>
                      {g.siglas.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Opcao id="dobro" label="Prazo em dobro" detalhe={PRAZO_EM_DOBRO} marcado={dobro} onChange={setDobro} />
            </Secao>
            <AvisoConferencia />
          </>
        }
        resultado={
          <Resultado
            titulo="Prazo processual"
            linhas={linhas}
            vazio="Informe a data para ver o vencimento."
            avisos={["Feriados estaduais e municipais e portarias do tribunal só entram se estiverem cadastrados em Prazos e avisos → Dias sem contagem."]}
            destaque={r && <p className="text-3xl font-semibold tabular-nums text-slate-900">{dataBR(r.fim)}</p>}
          />
        }
      />
    </>
  );
}
