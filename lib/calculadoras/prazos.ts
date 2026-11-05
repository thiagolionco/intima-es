/** Prazos frequentes para a calculadora de prazos processuais, com o dispositivo de cada um. */
import type { ContagemPrazo } from "../types.ts";

export interface PrazoComum {
  id: string;
  grupo: "CPC" | "CLT" | "CPP" | "Juizados";
  rotulo: string;
  dias: number;
  contagem: ContagemPrazo;
  base: string;
}

export const PRAZOS_COMUNS: PrazoComum[] = [
  { id: "cpc-contestacao", grupo: "CPC", rotulo: "Contestação", dias: 15, contagem: "uteis", base: "CPC, art. 335" },
  { id: "cpc-replica", grupo: "CPC", rotulo: "Réplica", dias: 15, contagem: "uteis", base: "CPC, arts. 350 e 351" },
  { id: "cpc-apelacao", grupo: "CPC", rotulo: "Apelação e contrarrazões", dias: 15, contagem: "uteis", base: "CPC, arts. 1.003, § 5º, e 1.010, § 1º" },
  { id: "cpc-agravo", grupo: "CPC", rotulo: "Agravo de instrumento", dias: 15, contagem: "uteis", base: "CPC, arts. 1.003, § 5º, e 1.015" },
  { id: "cpc-agravo-interno", grupo: "CPC", rotulo: "Agravo interno", dias: 15, contagem: "uteis", base: "CPC, art. 1.021" },
  { id: "cpc-embargos-declaracao", grupo: "CPC", rotulo: "Embargos de declaração", dias: 5, contagem: "uteis", base: "CPC, art. 1.023" },
  { id: "cpc-resp", grupo: "CPC", rotulo: "Recurso especial e extraordinário", dias: 15, contagem: "uteis", base: "CPC, arts. 1.003, § 5º, e 1.029" },
  { id: "cpc-pagamento", grupo: "CPC", rotulo: "Pagamento voluntário (cumprimento de sentença)", dias: 15, contagem: "uteis", base: "CPC, art. 523" },
  { id: "cpc-impugnacao", grupo: "CPC", rotulo: "Impugnação ao cumprimento de sentença", dias: 15, contagem: "uteis", base: "CPC, art. 525" },
  { id: "cpc-embargos-execucao", grupo: "CPC", rotulo: "Embargos à execução", dias: 15, contagem: "uteis", base: "CPC, art. 915" },
  { id: "cpc-generico", grupo: "CPC", rotulo: "Ato sem prazo fixado (manifestação)", dias: 5, contagem: "uteis", base: "CPC, art. 218, § 3º" },
  { id: "clt-ro", grupo: "CLT", rotulo: "Recurso ordinário e contrarrazões", dias: 8, contagem: "uteis", base: "CLT, arts. 895 e 900; Lei 5.584/1970, art. 6º" },
  { id: "clt-rr", grupo: "CLT", rotulo: "Recurso de revista", dias: 8, contagem: "uteis", base: "CLT, art. 896" },
  { id: "clt-ap", grupo: "CLT", rotulo: "Agravo de petição", dias: 8, contagem: "uteis", base: "CLT, art. 897, a" },
  { id: "clt-ai", grupo: "CLT", rotulo: "Agravo de instrumento", dias: 8, contagem: "uteis", base: "CLT, art. 897, b" },
  { id: "clt-ed", grupo: "CLT", rotulo: "Embargos de declaração", dias: 5, contagem: "uteis", base: "CLT, art. 897-A" },
  { id: "clt-embargos-execucao", grupo: "CLT", rotulo: "Embargos à execução e impugnação", dias: 5, contagem: "uteis", base: "CLT, art. 884" },
  { id: "clt-impugnacao-calculos", grupo: "CLT", rotulo: "Impugnação aos cálculos de liquidação", dias: 8, contagem: "uteis", base: "CLT, art. 879, § 2º" },
  { id: "cpp-resposta", grupo: "CPP", rotulo: "Resposta à acusação", dias: 10, contagem: "corridos", base: "CPP, art. 396" },
  { id: "cpp-memoriais", grupo: "CPP", rotulo: "Memoriais", dias: 5, contagem: "corridos", base: "CPP, art. 403, § 3º" },
  { id: "cpp-apelacao", grupo: "CPP", rotulo: "Apelação (interposição)", dias: 5, contagem: "corridos", base: "CPP, art. 593" },
  { id: "cpp-razoes", grupo: "CPP", rotulo: "Razões e contrarrazões de apelação", dias: 8, contagem: "corridos", base: "CPP, art. 600" },
  { id: "cpp-rese", grupo: "CPP", rotulo: "Recurso em sentido estrito", dias: 5, contagem: "corridos", base: "CPP, art. 586" },
  { id: "cpp-rese-razoes", grupo: "CPP", rotulo: "Razões do recurso em sentido estrito", dias: 2, contagem: "corridos", base: "CPP, art. 588" },
  { id: "cpp-ed", grupo: "CPP", rotulo: "Embargos de declaração", dias: 2, contagem: "corridos", base: "CPP, art. 619" },
  { id: "cpp-agravo-execucao", grupo: "CPP", rotulo: "Agravo em execução", dias: 5, contagem: "corridos", base: "LEP, art. 197; Súmula 700 do STF" },
  { id: "cpp-resp", grupo: "CPP", rotulo: "Recurso especial e extraordinário (penal)", dias: 15, contagem: "corridos", base: "CPC, art. 1.003, § 5º, c/c CPP, art. 798" },
  { id: "jec-recurso", grupo: "Juizados", rotulo: "Recurso inominado (cível)", dias: 10, contagem: "uteis", base: "Lei 9.099/1995, arts. 42 e 12-A" },
  { id: "jec-ed", grupo: "Juizados", rotulo: "Embargos de declaração (cível)", dias: 5, contagem: "uteis", base: "Lei 9.099/1995, arts. 49 e 12-A" },
  { id: "jecrim-apelacao", grupo: "Juizados", rotulo: "Apelação no Jecrim (com razões)", dias: 10, contagem: "corridos", base: "Lei 9.099/1995, art. 82, § 1º" },
];

export const PRAZO_EM_DOBRO = "Em dobro: Fazenda Pública (CPC, art. 183), Ministério Público (art. 180), Defensoria (art. 186) e litisconsortes com advogados de escritórios distintos em autos físicos (art. 229).";
