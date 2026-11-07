"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { dataBR, dataValida, reais } from "@/lib/calculadoras/base";
import { salarioMinimo } from "@/lib/calculadoras/parametros";
import { prescricaoTrabalhista } from "@/lib/calculadoras/prescricao";
import {
  calcularHorasExtras,
  calcularRescisao,
  calcularValorDaCausa,
  DANO_EXTRAPATRIMONIAL,
  DIVISORES,
  linhasRescisao,
  MODALIDADES,
  referenciaDanoMoral,
  RITOS,
  valorVincendas,
  type Modalidade,
  type NaturezaDano,
  type Pedido,
  type TipoAviso,
} from "@/lib/calculadoras/trabalhista";
import { hojeISO, uid } from "@/lib/utils";
import { AvisoConferencia, CabecalhoCalculadora, CampoData, CampoInteiro, CampoNumero, Layout, Opcao, Resultado, Secao } from "./comum";

export function CalculadoraValorCausaTrabalhista() {
  const hoje = hojeISO();
  const ano = Number(hoje.slice(0, 4));
  // Contrato
  const [admissao, setAdmissao] = useState("");
  const [saida, setSaida] = useState("");
  const [remuneracao, setRemuneracao] = useState<number | null>(null);
  const [modalidade, setModalidade] = useState<Modalidade>("sem_justa_causa");
  const [aviso, setAviso] = useState<TipoAviso>("indenizado");
  const [diasSaldo, setDiasSaldo] = useState<number | null>(null);
  const [feriasSimples, setFeriasSimples] = useState(0);
  const [feriasDobro, setFeriasDobro] = useState(0);
  const [mesesSemFgts, setMesesSemFgts] = useState(0);
  const [saldoFgts, setSaldoFgts] = useState<number | null>(null);
  const [multa477, setMulta477] = useState(false);
  const [multa467, setMulta467] = useState(false);
  const [excluidas, setExcluidas] = useState<string[]>([]);
  const [ajuizamento, setAjuizamento] = useState(hoje);
  // Horas extras
  const [comHE, setComHE] = useState(false);
  const [divisor, setDivisor] = useState(220);
  const [adicional, setAdicional] = useState<number | null>(50);
  const [horasMes, setHorasMes] = useState<number | null>(null);
  const [mesesHE, setMesesHE] = useState(0);
  const [dsr, setDsr] = useState<number | null>(16.67);
  const [reflexos, setReflexos] = useState(true);
  // Dano extrapatrimonial
  const [comDano, setComDano] = useState(false);
  const [natureza, setNatureza] = useState<NaturezaDano>("media");
  const [valorDano, setValorDano] = useState<number | null>(null);
  // Vincendas e outros
  const [comVincendas, setComVincendas] = useState(false);
  const [vincMensal, setVincMensal] = useState<number | null>(null);
  const [vincIndeterminado, setVincIndeterminado] = useState(true);
  const [vincMeses, setVincMeses] = useState(12);
  const [outros, setOutros] = useState<Pedido[]>([]);
  // Parâmetros
  const [sm, setSm] = useState<number | null>(salarioMinimo(ano));
  const [entePublico, setEntePublico] = useState(false);

  const contratoOk = dataValida(admissao) && dataValida(saida) && saida >= admissao && !!remuneracao && remuneracao > 0;
  const entrada = contratoOk
    ? {
        admissao,
        saida,
        remuneracao: remuneracao!,
        modalidade,
        aviso,
        diasSaldo: diasSaldo ?? undefined,
        feriasVencidasSimples: feriasSimples,
        feriasVencidasDobro: feriasDobro,
        mesesSemFgts,
        saldoFgts: saldoFgts ?? undefined,
        multa477,
        multa467,
      }
    : null;
  const rescisao = useMemo(() => (entrada ? calcularRescisao(entrada) : null), [JSON.stringify(entrada)]); // eslint-disable-line react-hooks/exhaustive-deps
  const prescricao = contratoOk && dataValida(ajuizamento) ? prescricaoTrabalhista(saida, ajuizamento, rescisao && rescisao.saidaProjetada !== saida ? Math.round((Date.parse(rescisao.saidaProjetada) - Date.parse(saida)) / 86_400_000) : 0) : null;

  const he =
    comHE && remuneracao && horasMes && mesesHE > 0
      ? calcularHorasExtras({ remuneracao, divisor, adicional: adicional ?? 50, horasPorMes: horasMes, meses: mesesHE, reflexoDsr: dsr ?? 0, reflexos, multaFgts: reflexos && (modalidade === "sem_justa_causa" || modalidade === "rescisao_indireta") })
      : null;
  const refDano = remuneracao ? referenciaDanoMoral(natureza, remuneracao) : null;
  const vinc = comVincendas && vincMensal ? valorVincendas(vincMensal, vincIndeterminado ? null : vincMeses) : null;

  const pedidos: Pedido[] = [
    ...(rescisao?.verbas.filter((v) => !excluidas.includes(v.id)).map((v) => ({ id: v.id, descricao: v.rotulo, valor: v.valor, base: v.base })) ?? []),
    ...(he?.linhas.map((l) => ({ id: l.id, descricao: l.rotulo, valor: l.valor, base: l.base })) ?? []),
    ...(comDano && valorDano ? [{ id: "dano", descricao: `Indenização por dano extrapatrimonial (${DANO_EXTRAPATRIMONIAL[natureza].rotulo.toLowerCase()})`, valor: valorDano, base: refDano?.base }] : []),
    ...(vinc ? [{ id: "vincendas", descricao: "Prestações vincendas", valor: vinc.valor, base: "CPC, art. 292, §§ 1º e 2º" }] : []),
    ...outros,
  ];
  const causa = pedidos.length && sm ? calcularValorDaCausa(pedidos, { ano: Number(ajuizamento.slice(0, 4)) || ano, salarioMinimo: sm, entePublico }) : null;
  const avisos = [...(rescisao?.avisos ?? []), ...(he?.avisos ?? []), ...(comDano && refDano ? [refDano.aviso] : []), ...(causa?.avisos ?? [])];

  return (
    <>
      <CabecalhoCalculadora
        titulo="Valor da causa trabalhista"
        descricao="Calcula cada pedido com a conta e o dispositivo legal, soma o valor da causa (CPC, art. 292, VI) e indica o rito, as custas e a faixa de honorários. Desde a Reforma, cada pedido precisa de valor (CLT, art. 840, § 1º)."
      />
      <Layout
        formulario={
          <>
            <Secao titulo="1. Contrato de trabalho">
              <div className="grid gap-4 sm:grid-cols-2">
                <CampoData id="admissao" label="Admissão" valor={admissao} onChange={setAdmissao} obrigatorio />
                <CampoData id="saida" label="Último dia trabalhado" valor={saida} onChange={setSaida} hint="No aviso trabalhado, o último dia do aviso." obrigatorio />
              </div>
              {dataValida(admissao) && dataValida(saida) && saida < admissao && <p className="text-xs text-red-600">A saída não pode ser antes da admissão.</p>}
              <CampoNumero id="remuneracao" label="Remuneração mensal" prefixo="R$" valor={remuneracao} onChange={setRemuneracao} hint="Salário + média das parcelas variáveis habituais (comissões, adicionais, horas extras habituais)." obrigatorio />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Modalidade da rescisão" htmlFor="modalidade">
                  <Select id="modalidade" value={modalidade} onChange={(e) => setModalidade(e.target.value as Modalidade)}>
                    {MODALIDADES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.rotulo}
                      </option>
                    ))}
                  </Select>
                </Field>
                {(modalidade === "sem_justa_causa" || modalidade === "rescisao_indireta" || modalidade === "acordo") && (
                  <Field label="Aviso prévio" htmlFor="aviso">
                    <Select id="aviso" value={aviso} onChange={(e) => setAviso(e.target.value as TipoAviso)}>
                      <option value="indenizado">Indenizado</option>
                      <option value="trabalhado">Trabalhado</option>
                    </Select>
                  </Field>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <CampoNumero id="dias-saldo" label="Dias de saldo de salário" valor={diasSaldo} onChange={setDiasSaldo} casas={0} hint="Vazio: o dia do mês da saída. Zere se o mês já foi pago." />
                <CampoInteiro id="meses-fgts" label="Meses sem depósito de FGTS" valor={mesesSemFgts} onChange={setMesesSemFgts} />
                <CampoInteiro id="ferias-simples" label="Férias vencidas simples (períodos)" valor={feriasSimples} onChange={setFeriasSimples} hint="Ainda no prazo de concessão." />
                <CampoInteiro id="ferias-dobro" label="Férias vencidas em dobro (períodos)" valor={feriasDobro} onChange={setFeriasDobro} hint="Prazo de concessão vencido (art. 137)." />
              </div>
              <CampoNumero id="saldo-fgts" label="Saldo do FGTS para fins rescisórios" prefixo="R$" valor={saldoFgts} onChange={setSaldoFgts} hint="Do extrato da Caixa. Vazio: a multa usa uma estimativa dos depósitos." />
              <Opcao id="m477" label="Multa do art. 477, § 8º (verbas pagas fora do prazo de 10 dias)" marcado={multa477} onChange={setMulta477} />
              <Opcao id="m467" label="Multa do art. 467 (verbas incontroversas não pagas na 1ª audiência)" marcado={multa467} onChange={setMulta467} />
              <CampoData id="ajuizamento" label="Data prevista do ajuizamento" valor={ajuizamento} onChange={setAjuizamento} hint="Para conferir a prescrição e o salário mínimo da alçada." />
            </Secao>

            {rescisao && (
              <Secao titulo="2. Verbas rescisórias a pedir">
                <p className="text-xs text-slate-500">Desmarque o que já foi pago corretamente.</p>
                <div className="space-y-2">
                  {rescisao.verbas.map((v) => (
                    <Opcao
                      key={v.id}
                      id={`v-${v.id}`}
                      label={
                        <span className="flex flex-wrap justify-between gap-x-3">
                          <span>{v.rotulo}</span>
                          <span className="tabular-nums text-slate-900">{reais(v.valor)}</span>
                        </span>
                      }
                      detalhe={v.base}
                      marcado={!excluidas.includes(v.id)}
                      onChange={(m) => setExcluidas(m ? excluidas.filter((x) => x !== v.id) : [...excluidas, v.id])}
                    />
                  ))}
                </div>
              </Secao>
            )}

            <Secao titulo="3. Horas extras">
              <Opcao id="com-he" label="Pedir horas extras" marcado={comHE} onChange={setComHE} />
              {comHE && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Jornada contratual (divisor)" htmlFor="divisor">
                      <Select id="divisor" value={divisor} onChange={(e) => setDivisor(Number(e.target.value))}>
                        {DIVISORES.map((d) => (
                          <option key={d.divisor} value={d.divisor}>
                            {d.horas} h semanais (divisor {d.divisor})
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <CampoNumero id="adicional" label="Adicional" sufixo="%" valor={adicional} onChange={setAdicional} hint="Mínimo de 50%; veja a norma coletiva." />
                    <CampoNumero id="horas-mes" label="Horas extras por mês" valor={horasMes} onChange={setHorasMes} />
                    <CampoInteiro id="meses-he" label="Meses (dentro dos 5 anos)" valor={mesesHE} onChange={setMesesHE} max={60} />
                    <CampoNumero id="dsr" label="Reflexo em DSR" sufixo="%" valor={dsr} onChange={setDsr} hint="Domingos e feriados ÷ dias úteis do mês; 16,67% é a média (1/6)." />
                  </div>
                  <Opcao id="reflexos" label="Somar reflexos em 13º, férias + 1/3 e FGTS" marcado={reflexos} onChange={setReflexos} />
                </>
              )}
            </Secao>

            <Secao titulo="4. Dano extrapatrimonial">
              <Opcao id="com-dano" label="Pedir indenização por dano moral" marcado={comDano} onChange={setComDano} />
              {comDano && (
                <>
                  <Field label="Natureza da ofensa" htmlFor="natureza" hint={refDano ? `Parâmetro do art. 223-G, § 1º: até ${reais(refDano.limite)} (${refDano.conta}).` : "Informe a remuneração para ver o parâmetro legal."}>
                    <Select id="natureza" value={natureza} onChange={(e) => setNatureza(e.target.value as NaturezaDano)}>
                      {Object.entries(DANO_EXTRAPATRIMONIAL).map(([id, d]) => (
                        <option key={id} value={id}>
                          {d.rotulo}: até {d.vezes} salários
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <CampoNumero id="valor-dano" label="Valor pedido" prefixo="R$" valor={valorDano} onChange={setValorDano} />
                  {refDano && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setValorDano(refDano.limite)}>
                      Usar o parâmetro legal ({reais(refDano.limite)})
                    </Button>
                  )}
                </>
              )}
            </Secao>

            <Secao titulo="5. Outros pedidos">
              <Opcao id="com-vincendas" label="Prestações vincendas (ex.: salários até a reintegração, pensão)" marcado={comVincendas} onChange={setComVincendas} />
              {comVincendas && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoNumero id="vinc-mensal" label="Valor mensal" prefixo="R$" valor={vincMensal} onChange={setVincMensal} />
                  <div className="space-y-2">
                    <Opcao id="vinc-ind" label="Por tempo indeterminado ou mais de 1 ano" detalhe="Entra uma prestação anual (CPC, art. 292, § 2º)." marcado={vincIndeterminado} onChange={setVincIndeterminado} />
                    {!vincIndeterminado && <CampoInteiro id="vinc-meses" label="Meses" valor={vincMeses} onChange={setVincMeses} min={1} />}
                  </div>
                </div>
              )}
              <ul className="space-y-2">
                {outros.map((p, i) => (
                  <li key={p.id} className="flex items-start gap-2">
                    <Input aria-label="Descrição do pedido" placeholder="Ex.: adicional de insalubridade" value={p.descricao} onChange={(e) => setOutros(outros.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))} />
                    <CampoNumero id={`outro-${p.id}`} label="" prefixo="R$" valor={p.valor || null} onChange={(v) => setOutros(outros.map((x, j) => (j === i ? { ...x, valor: v ?? 0 } : x)))} className="w-44 shrink-0 [&>label]:hidden" />
                    <button type="button" aria-label="Remover pedido" onClick={() => setOutros(outros.filter((_, j) => j !== i))} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600">
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              <Button type="button" variant="secondary" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setOutros([...outros, { id: uid(), descricao: "", valor: 0 }])}>
                Adicionar pedido
              </Button>
            </Secao>

            <Secao titulo="Parâmetros">
              <CampoNumero id="sm" label={`Salário mínimo (${ano})`} prefixo="R$" valor={sm} onChange={setSm} hint="O vigente no ajuizamento (Súmula 356 do TST)." />
              <Opcao id="ente" label="Reclamada é ente público (administração direta, autarquia ou fundação)" detalhe="Afasta o sumaríssimo (art. 852-A, parágrafo único)." marcado={entePublico} onChange={setEntePublico} />
            </Secao>
            <AvisoConferencia />
          </>
        }
        resultado={
          <>
            {prescricao && !prescricao.bienalOk && (
              <Alert tone="error" title="Prescrição bienal">
                O prazo para ajuizar terminou em {dataBR(prescricao.prorrogadoPara ?? prescricao.limiteBienal!)} (CF, art. 7º, XXIX).
              </Alert>
            )}
            {prescricao && prescricao.bienalOk && admissao < prescricao.marcoQuinquenal && (
              <Alert tone="warning" title="Prescrição quinquenal">
                Créditos vencidos antes de {dataBR(prescricao.marcoQuinquenal)} estão prescritos. Limite horas extras e diferenças a esse período.
              </Alert>
            )}
            <Resultado
              titulo="Valor da causa"
              linhas={causa?.linhas ?? null}
              avisos={avisos}
              vazio="Preencha o contrato ou adicione um pedido com valor."
              destaque={
                causa && (
                  <div>
                    <p className="text-3xl font-semibold tabular-nums text-slate-900">{reais(causa.total)}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {RITOS[causa.rito].rotulo} · {RITOS[causa.rito].regra}
                    </p>
                  </div>
                )
              }
            />
            {rescisao && entrada && <Resultado titulo="Memória das verbas rescisórias" linhas={linhasRescisao(rescisao, entrada)} />}
          </>
        }
      />
    </>
  );
}
