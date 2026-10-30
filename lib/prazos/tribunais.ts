/**
 * Tribunais que aparecem no filtro do calendário e onde cada um publica os feriados e suspensões.
 *
 * Os endereços foram conferidos em 30/10/2026 (a maioria a partir da lista "Feriados forenses
 * 2026" da AASP). Quando o tribunal tem página que se atualiza sozinha, ela vem antes do ato do
 * ano; tribunais sem calendário oficial encontrado ficam sem endereço.
 */

export interface GrupoTribunais {
  nome: string;
  siglas: string[];
}

/** "trt-9", " TRT 9 " e "TRT9" viram "TRT9", o formato usado pelo Comunica PJe. */
export function siglaTribunal(tribunal: string | null | undefined): string {
  return (tribunal ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DFT", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

export const GRUPOS_TRIBUNAIS: GrupoTribunais[] = [
  { nome: "Tribunais superiores", siglas: ["STF", "STJ", "TST", "STM", "TSE"] },
  { nome: "Justiça Federal", siglas: [1, 2, 3, 4, 5, 6].map((n) => `TRF${n}`) },
  { nome: "Justiça do Trabalho", siglas: Array.from({ length: 24 }, (_, i) => `TRT${i + 1}`) },
  { nome: "Justiça Estadual", siglas: UFS.map((uf) => `TJ${uf}`) },
];

export const CALENDARIO_OFICIAL: Record<string, string> = {
  STF: "https://atosnormativos.stf.jus.br/visualizador/4rgBq5kBmFdZiXoIf1Wi",
  STJ: "https://www.stj.jus.br/sites/portalp/SiteAssets/midias/Calendario_STJ_2026.pdf",
  STM: "https://www.stm.jus.br/images/JMU/calendario_oficial/calendario_2026_STM.pdf",
  TST: "https://www.tst.jus.br/documents/d/guest/calendario-oficial-a4-2026-v7-pdf",
  TRF2: "https://www.trf2.jus.br/jfrj/atendimento/calendario-de-prazos-suspensos-feriados",
  TRF3: "https://www.trf3.jus.br/seju/calendario-dos-feriados",
  TRF4: "https://www.trf4.jus.br/trf4/controlador.php?acao=calendario_feriados_listar",
  TRF5: "https://www4.trf5.jus.br/comunicacao-social/anexo/114014",
  TRF6: "https://portal.trf6.jus.br/calendario-2/",
  TRT1: "https://bibliotecadigital.trt1.jus.br/jspui/html/1001/4472618/Ato2025-0109-C.htm",
  TRT2: "https://ww2.trt2.jus.br/servicos/agenda/feriados-e-suspensoes-de-expediente",
  TRT3: "https://portal.trt3.jus.br/internet/institucional/calendario/calendario-2026",
  TRT4: "https://www.trt4.jus.br/portais/media/503496047/Calend%C3%A1rio%202026%20%281%29.pdf",
  TRT5: "https://www.trt5.jus.br/sites/default/files/sistema/normas/2025-06/0037-2025_aprova_calendario_exercicio_de_2026.pdf",
  TRT6: "https://www.trt6.jus.br/portal/sites/default/files/documents/portaria_gp_495-2025_-_feriados_2026_assinada1_0.pdf",
  TRT7: "https://www.trt7.jus.br/index.php/servicos/agendas-e-calendarios/calendario-de-feriados-do-trt-ce/16348-calendario-de-feriados-2026?showall=1",
  TRT8: "https://www.trt8.jus.br/sites/portal/files/roles/assessoria-de-comunicacao/noticias-2025/014_-_portaria_-_presi_n.o_1200-2025_assinada.pdf",
  TRT9: "https://www.trt9.jus.br/institucional/calendario.xhtml",
  TRT10: "https://www.trt10.jus.br/docsweb/institucional/calendario/pdf/calendario_2026.pdf",
  TRT13: "https://www.trt13.jus.br/acesso-a-informacao/calendario-2026",
  TRT15: "https://trt15.jus.br/sites/portal/files/fields/normas-institucionais/anexos/2025/anexo_portaria-gp-cr-no-0162025_id50386.pdf",
  TRT16: "https://www.trt16.jus.br/site/conteudo/calendario/arquivos/2025-09_arquivo-upload_calendario-institucional-2026.pdf",
  TRT17: "https://www.trt17.jus.br/documents/652773/1081244/ATO+PRESI+SECOR+n%C2%BA+44-2025+-+CALEND%C3%81RIO+2026+%28REPUBLICA%C3%87%C3%83O%29.pdf",
  TRT18: "https://bibliotecadigital.trt18.jus.br/xmlui/bitstream/handle/bdtrt18/34221/Portaria_TRT18_2329_2025.PDF?sequence=1&isAllowed=y",
  TRT19: "https://site.trt19.jus.br/feriadosoficiaistrt19",
  TRT20: "https://www.trt20.jus.br/images/documentos/calendario/Calendario_2026.pdf",
  TRT21: "https://www.trt21.jus.br/transparencia/acesso-informacao/calendario-institucional",
  TRT23: "https://portal.trt23.jus.br/portal/sites/portal/files/groups/secor/portaria_conjunta_trt_correg_gp_n._28-2025_estabelece_o_calendario_forense_2026.pdf",
  TRT24: "https://adm.trt24.jus.br/intranet-api/rest/v1/documento/2454628",
  TJAM: "https://consultasaj.tjam.jus.br/cdje/consultaSimples.do?cdVolume=18&nuDiario=4151&cdCaderno=8&nuSeqpagina=8",
  TJAP: "https://old.tjap.jus.br/app/open/consultas/?task=cal",
  TJBA: "https://www7.tjba.jus.br/secao/lerPublicacao.wsp?tmp.mostrarDiv=sim&tmp.id=41093&tmp.secao=9",
  TJES: "https://www.tjes.jus.br/consultas/feriados/",
  TJMA: "https://novogerenciador.tjma.jus.br/storage/arquivos/resolucoes_2025/resolucao_gp_n_131_de_4_de_novembro_de_2025_05_11_2025_17_12_45.pdf",
  TJMG: "https://www8.tjmg.jus.br/servicos/gj/calendario/",
  TJPA: "https://www.tjpa.jus.br/CMSPortal/VisualizarArquivo?idArquivo=2234620",
  TJPB: "https://www.tjpb.jus.br/sites/default/files/anexos/2025/10/16_10_2025_Ato_Conjunto.pdf",
  TJPE: "https://portal.tjpe.jus.br/documents/d/portal/feriados-2026-pdf",
  TJPI: "https://transparencia.tjpi.jus.br/legislacoes/5277/public",
  TJPR: "https://www.tjpr.jus.br/calendario",
  TJRJ: "https://www.tjrj.jus.br/documents/d/portal-conhecimento/suspensao-prazos-1a-e-2a-instancia_2026_seesc",
  TJRO: "https://www.tjro.jus.br/feriados-locais/feriados-2026",
  TJRS: "https://drive.google.com/file/d/1SCtOTFAzifw77vJe0R5hylyyxX4H5SDM/view",
  TJSC: "https://www.tjsc.jus.br/calendario-institucional",
  TJSE: "https://www.tjse.jus.br/portal/arquivos/documentos/publicacoes/calendarios/calendario-tjse-2026.pdf",
  TJSP: "https://www.assetj.org.br/wp-content/uploads/2025/11/PROVIMENTO-CSM-2813-2025-COMPLETO.pdf",
  TJTO: "https://wwa.tjto.jus.br/diario/pesquisa/materia/904337",
};

/** Onde conferir o calendário do tribunal; sem endereço, a lista da AASP reúne os atos de todos. */
export function calendarioOficial(tribunal: string): string {
  return CALENDARIO_OFICIAL[siglaTribunal(tribunal)] ?? "https://www.aasp.org.br/produtos-servicos/expediente-forense/feriados-forenses-2026/";
}

/** Outros documentos que o Clepsa lê junto com o calendário (ex.: a página do TJPR é montada pelo navegador). */
const FONTES_EXTRAS: Record<string, string[]> = {
  TJPR: ["https://posse.tjpr.jus.br/documents/d/comunicacao/sei_12428873_decreto"],
  TRF3: ["https://www.trf3.jus.br/documentos/seju/Feriados/2025/2026_-_calendario_de_feriados_-_at_25.06.2026.pdf"],
};

/** Endereços que o servidor lê para montar o calendário do tribunal dentro do Clepsa. */
export function fontesDoTribunal(tribunal: string): string[] {
  const t = siglaTribunal(tribunal);
  return [CALENDARIO_OFICIAL[t], ...(FONTES_EXTRAS[t] ?? [])].filter((u): u is string => !!u);
}

/** Domínio do site do tribunal (trt9.jus.br), onde a pesquisa procura quando a leitura direta falha. */
export function dominioTribunal(tribunal: string): string | undefined {
  const t = siglaTribunal(tribunal);
  return GRUPOS_TRIBUNAIS.some((g) => g.siglas.includes(t)) ? `${t.toLowerCase()}.jus.br` : undefined;
}
