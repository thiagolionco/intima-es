import type { Intimacao, StatusIntimacao, TermoMonitorado } from "./types";
import { addDays, hojeISO, uid } from "./utils";

/** Dados fictícios para explorar a aplicação sem acessar o Comunica. */
export function gerarDadosDemo(): { intimacoes: Intimacao[]; termos: TermoMonitorado[] } {
  const agora = new Date().toISOString();
  const hoje = hojeISO();

  const termos: TermoMonitorado[] = [
    { id: uid(), apelido: "Construtora Horizonte", tipo: "parte", valor: "Construtora Horizonte Ltda", ativo: true, createdAt: agora },
    { id: uid(), apelido: "Maria Aparecida Souza", tipo: "parte", valor: "Maria Aparecida Souza", ativo: true, createdAt: agora },
    { id: uid(), apelido: "Transportes Rio Claro", tipo: "parte", valor: "Transportes Rio Claro S/A", tribunal: "TRT15", ativo: true, createdAt: agora },
    { id: uid(), apelido: "Dr. Lucas (OAB)", tipo: "oab", valor: "123456", ufOab: "SP", ativo: false, createdAt: agora },
  ];

  const modelos = [
    {
      cliente: "Construtora Horizonte",
      parte: "Construtora Horizonte Ltda",
      contra: "Condomínio Residencial Ipê Amarelo",
      tribunal: "TJSP",
      orgao: "5ª Vara Cível do Foro Central de São Paulo",
      classe: "Procedimento Comum Cível",
      textos: [
        "Fica a parte ré intimada para, no prazo de 15 (quinze) dias, apresentar contestação, sob pena de revelia.",
        "Intimem-se as partes para que especifiquem as provas que pretendem produzir, justificando sua pertinência, no prazo de 5 dias.",
        "Designo audiência de conciliação para o dia indicado nos autos. Intimem-se as partes por meio de seus advogados.",
      ],
    },
    {
      cliente: "Maria Aparecida Souza",
      parte: "Maria Aparecida Souza",
      contra: "Instituto Nacional do Seguro Social - INSS",
      tribunal: "TRF3",
      orgao: "2ª Vara Federal Previdenciária de Campinas",
      classe: "Procedimento do Juizado Especial Cível",
      textos: [
        "Ciência às partes do laudo pericial juntado aos autos. Prazo comum de 10 dias para manifestação.",
        "Sentença: JULGO PROCEDENTE o pedido para condenar o INSS a conceder o benefício de aposentadoria por incapacidade permanente.",
        "Intime-se a parte autora para apresentar contrarrazões ao recurso inominado interposto pelo réu, no prazo legal.",
      ],
    },
    {
      cliente: "Transportes Rio Claro",
      parte: "Transportes Rio Claro S/A",
      contra: "José Carlos Pereira",
      tribunal: "TRT15",
      orgao: "1ª Vara do Trabalho de Rio Claro",
      classe: "Ação Trabalhista - Rito Ordinário",
      textos: [
        "Notifica-se a reclamada para comparecer à audiência UNA, devendo apresentar defesa e documentos, sob pena de revelia e confissão.",
        "Fica intimada a reclamada para, no prazo de 8 dias, comprovar o depósito recursal e o recolhimento das custas.",
        "Homologo os cálculos de liquidação. Intime-se a executada para pagamento em 48 horas, sob pena de penhora.",
      ],
    },
  ];

  const tipos = ["Intimação", "Intimação", "Intimação", "Citação", "Edital", "Notificação"];
  const docs = ["Despacho", "Decisão", "Sentença", "Ato ordinatório", "Certidão"];
  const statusPorIdade = (dias: number): StatusIntimacao => {
    if (dias < 7) return "nova";
    if (dias < 25) return dias % 3 === 0 ? "respondida" : "em_analise";
    return dias % 4 === 0 ? "arquivada" : "respondida";
  };

  const intimacoes: Intimacao[] = [];
  for (let k = 0; k < 30; k++) {
    const m = modelos[k % modelos.length];
    const dias = Math.floor((k * 37) % 120) + (k % 5);
    const data = addDays(hoje, -dias);
    const seq = String(1000000 + k * 7919).slice(-7);
    const ano = data.slice(0, 4);
    const j = m.tribunal.startsWith("TRT") ? "5" : m.tribunal.startsWith("TRF") ? "4" : "8";
    const tr = m.tribunal === "TJSP" ? "26" : m.tribunal === "TRF3" ? "03" : "15";
    const processo = `${seq}-${String(10 + (k % 89)).padStart(2, "0")}.${ano}.${j}.${tr}.${String(100 + k).padStart(4, "0")}`;
    const status = statusPorIdade(dias);
    intimacoes.push({
      id: uid(),
      origem: k % 6 === 5 ? "manual" : "comunica",
      comunicaId: k % 6 === 5 ? undefined : `demo-${k}`,
      hash: k % 6 === 5 ? undefined : `demo-hash-${k}`,
      cliente: m.cliente,
      tribunal: m.tribunal,
      orgao: m.orgao,
      dataDisponibilizacao: data,
      tipoComunicacao: tipos[dias % tipos.length],
      meio: k % 9 === 8 ? "E" : "D",
      tipoDocumento: docs[k % docs.length],
      classe: m.classe,
      numeroProcesso: processo,
      partes: [
        { nome: m.parte, polo: k % 2 ? "A" : "P" },
        { nome: m.contra, polo: k % 2 ? "P" : "A" },
      ],
      advogados: [
        { nome: "Lucas Andrade Martins", oab: "123456", uf: "SP" },
        ...(k % 3 === 0 ? [{ nome: "Fernanda Lima Rocha", oab: "98765", uf: "SP" }] : []),
      ],
      texto: `${m.textos[k % m.textos.length]}\n\n(Dados fictícios gerados para demonstração.)`,
      link: undefined,
      status,
      prazo: status === "nova" || status === "em_analise" ? addDays(data, 15) : undefined,
      observacoes: k % 4 === 0 ? "Conferir com o cliente antes de protocolar." : undefined,
      createdAt: agora,
      updatedAt: agora,
    });
  }
  return { intimacoes, termos };
}
