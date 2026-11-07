"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { duracaoTexto, emDias, fracaoTexto, type Duracao } from "@/lib/calculadoras/base";
import { AGRAVANTES, ATENUANTES, CAUSAS_COMUNS, CIRCUNSTANCIAS_JUDICIAIS, calcularDosimetria, type Causa, type CriterioBase } from "@/lib/calculadoras/pena";
import { AvisoConferencia, CabecalhoCalculadora, CampoDuracao, Layout, Opcao, Resultado, Secao } from "./comum";

function alternar(lista: string[], id: string, marcado: boolean) {
  return marcado ? [...lista, id] : lista.filter((x) => x !== id);
}

const FRACOES = ["1/6", "1/5", "1/4", "1/3", "1/2", "2/3", "1/8", "1/12"];

function lerFracao(s: string) {
  const [num, den] = s.split("/").map(Number);
  return { num, den };
}

export function CalculadoraDosimetria() {
  const [minimo, setMinimo] = useState<Duracao>({ anos: 0, meses: 0, dias: 0 });
  const [maximo, setMaximo] = useState<Duracao>({ anos: 0, meses: 0, dias: 0 });
  const [judiciais, setJudiciais] = useState<string[]>([]);
  const [criterio, setCriterio] = useState<CriterioBase>("oitavo_intervalo");
  const [atenuantes, setAtenuantes] = useState<string[]>([]);
  const [agravantes, setAgravantes] = useState<string[]>([]);
  const [fracao2, setFracao2] = useState("1/6");
  const [causas, setCausas] = useState<Causa[]>([]);
  const [preset, setPreset] = useState(CAUSAS_COMUNS[0].id);
  const [tipoPena, setTipoPena] = useState<"reclusao" | "detencao">("reclusao");
  const [violencia, setViolencia] = useState(false);
  const [culposo, setCulposo] = useState(false);
  const [reincDoloso, setReincDoloso] = useState(true);
  const [maior70, setMaior70] = useState(false);

  const reincidente = agravantes.includes("reincidencia");
  const idade = atenuantes.includes("idade");
  const valido = emDias(minimo) > 0 && emDias(maximo) >= emDias(minimo);
  const r = valido
    ? calcularDosimetria({
        minimo,
        maximo,
        desfavoraveis: judiciais.length,
        criterio,
        agravantes: agravantes.length,
        atenuantes: atenuantes.length,
        fracaoSegundaFase: lerFracao(fracao2),
        causas,
        tipoPena,
        reincidente,
        reincidenteDoloso: reincidente && reincDoloso,
        violenciaOuGraveAmeaca: violencia,
        culposo,
        maiorDe70: maior70,
        reduzPrescricao: idade,
      })
    : null;

  function adicionarCausa() {
    const c = CAUSAS_COMUNS.find((x) => x.id === preset)!;
    // Por padrão, a fração mais favorável à defesa: menor aumento, maior diminuição.
    const fracao = c.tipo === "aumento" ? c.min : c.max;
    setCausas([...causas, { descricao: c.rotulo, tipo: c.tipo, fracao, base: c.base }]);
  }

  return (
    <>
      <CabecalhoCalculadora
        titulo="Dosimetria e atenuação da pena"
        descricao="Critério trifásico do art. 68 do CP: pena-base, atenuantes e agravantes, causas de diminuição e de aumento. Depois, regime, substituição, sursis e prescrição pela pena aplicada."
      />
      <Layout
        formulario={
          <>
            <Secao titulo="Pena cominada">
              <CampoDuracao id="minimo" label="Mínimo" valor={minimo} onChange={setMinimo} />
              <CampoDuracao id="maximo" label="Máximo" valor={maximo} onChange={setMaximo} />
              {emDias(maximo) > 0 && emDias(maximo) < emDias(minimo) && <p className="text-xs text-red-600">O máximo não pode ser menor que o mínimo.</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Espécie" htmlFor="tipo">
                  <Select id="tipo" value={tipoPena} onChange={(e) => setTipoPena(e.target.value as "reclusao" | "detencao")}>
                    <option value="reclusao">Reclusão</option>
                    <option value="detencao">Detenção</option>
                  </Select>
                </Field>
              </div>
              <Opcao id="violencia" label="Crime com violência ou grave ameaça à pessoa" marcado={violencia} onChange={setViolencia} />
              <Opcao id="culposo" label="Crime culposo" marcado={culposo} onChange={setCulposo} />
              <Opcao id="maior70" label="Réu maior de 70 anos na data da sentença" detalhe="Sursis etário até 4 anos (art. 77, § 2º). Marque também a atenuante do art. 65, I." marcado={maior70} onChange={setMaior70} />
            </Secao>

            <Secao titulo="1ª fase: circunstâncias judiciais negativas (art. 59)">
              <div className="grid gap-2 sm:grid-cols-2">
                {CIRCUNSTANCIAS_JUDICIAIS.map((c) => (
                  <Opcao key={c} id={`j-${c}`} label={c} marcado={judiciais.includes(c)} onChange={(v) => setJudiciais(alternar(judiciais, c, v))} />
                ))}
              </div>
              <Field label="Fração por circunstância" htmlFor="criterio" hint="O STJ aceita os dois critérios; nenhum é obrigatório.">
                <Select id="criterio" value={criterio} onChange={(e) => setCriterio(e.target.value as CriterioBase)}>
                  <option value="oitavo_intervalo">1/8 do intervalo entre o mínimo e o máximo</option>
                  <option value="sexto_minimo">1/6 da pena mínima</option>
                </Select>
              </Field>
            </Secao>

            <Secao titulo="2ª fase: atenuantes e agravantes">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Atenuantes (arts. 65 e 66)</p>
              <div className="space-y-2">
                {ATENUANTES.map((a) => (
                  <Opcao key={a.id} id={`at-${a.id}`} label={a.rotulo} detalhe={a.base} marcado={atenuantes.includes(a.id)} onChange={(v) => setAtenuantes(alternar(atenuantes, a.id, v))} />
                ))}
              </div>
              <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Agravantes (arts. 61 e 62)</p>
              <div className="space-y-2">
                {AGRAVANTES.map((a) => (
                  <Opcao key={a.id} id={`ag-${a.id}`} label={a.rotulo} detalhe={a.base} marcado={agravantes.includes(a.id)} onChange={(v) => setAgravantes(alternar(agravantes, a.id, v))} />
                ))}
              </div>
              {reincidente && <Opcao id="reinc-doloso" label="A reincidência é em crime doloso" detalhe="Afasta a substituição (art. 44, II) e o sursis (art. 77, I)." marcado={reincDoloso} onChange={setReincDoloso} />}
              <Field label="Fração por atenuante ou agravante" htmlFor="fracao2" hint="Usual no STJ: 1/6 sobre a pena-base.">
                <Select id="fracao2" value={fracao2} onChange={(e) => setFracao2(e.target.value)}>
                  {FRACOES.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </Select>
              </Field>
            </Secao>

            <Secao titulo="3ª fase: causas de diminuição e de aumento">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select aria-label="Causa" value={preset} onChange={(e) => setPreset(e.target.value)}>
                  {CAUSAS_COMUNS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.tipo === "aumento" ? "↑" : "↓"} {c.rotulo} ({fracaoTexto(c.min)}
                      {c.min.num !== c.max.num || c.min.den !== c.max.den ? ` a ${fracaoTexto(c.max)}` : ""})
                    </option>
                  ))}
                </Select>
                <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={adicionarCausa}>
                  Adicionar
                </Button>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setCausas([...causas, { descricao: "Outra causa", tipo: "diminuicao", fracao: { num: 1, den: 3 } }])}>
                + Causa não listada
              </Button>
              {causas.length === 0 && <p className="text-sm text-slate-500">Nenhuma causa adicionada.</p>}
              <ul className="space-y-3">
                {causas.map((c, i) => {
                  const mudar = (p: Partial<Causa>) => setCausas(causas.map((x, j) => (j === i ? { ...x, ...p } : x)));
                  return (
                    <li key={i} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-start gap-2">
                        <Input aria-label="Descrição da causa" value={c.descricao} onChange={(e) => mudar({ descricao: e.target.value })} />
                        <button type="button" aria-label="Remover causa" onClick={() => setCausas(causas.filter((_, j) => j !== i))} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600">
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <Select aria-label="Tipo" className="w-auto" value={c.tipo} onChange={(e) => mudar({ tipo: e.target.value as Causa["tipo"] })}>
                          <option value="diminuicao">Diminui</option>
                          <option value="aumento">Aumenta</option>
                        </Select>
                        <Input aria-label="Numerador" type="number" min={1} className="w-16" value={c.fracao.num} onChange={(e) => mudar({ fracao: { ...c.fracao, num: Math.max(1, Number(e.target.value) || 1) } })} />
                        <span>/</span>
                        <Input aria-label="Denominador" type="number" min={1} className="w-16" value={c.fracao.den} onChange={(e) => mudar({ fracao: { ...c.fracao, den: Math.max(1, Number(e.target.value) || 1) } })} />
                        {c.base && <span className="text-xs text-slate-500">{c.base}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-slate-500">Cada causa incide sobre o resultado da anterior. Ao adicionar, a fração vem na posição mais favorável à defesa; ajuste se for o caso.</p>
            </Secao>
            <AvisoConferencia />
          </>
        }
        resultado={
          <Resultado
            titulo="Dosimetria"
            linhas={r?.linhas ?? null}
            avisos={r?.avisos}
            vazio="Informe a pena mínima e a máxima cominadas ao crime."
            destaque={
              r && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pena definitiva</p>
                  <p className="text-3xl font-semibold text-slate-900">{duracaoTexto(r.penaDefinitiva)}</p>
                  <p className="mt-1 text-sm text-slate-600">Regime inicial: {r.regime}</p>
                </div>
              )
            }
          />
        }
      />
    </>
  );
}
