import { criarZip } from "./zip.ts";

/** Documento Word simples: cabeçalho com o escritório, título e parágrafos (títulos curtos em negrito). */
export interface DocumentoWord {
  escritorio?: string;
  titulo: string;
  subtitulo?: string;
  texto: string;
  rodape?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function paragrafo(texto: string, op: { negrito?: boolean; tamanho?: number; alinhamento?: "center" | "both"; espacoDepois?: number } = {}) {
  const props = [
    op.alinhamento ? `<w:jc w:val="${op.alinhamento}"/>` : "",
    `<w:spacing w:after="${op.espacoDepois ?? 160}" w:line="300" w:lineRule="auto"/>`,
  ].join("");
  const run = [op.negrito ? "<w:b/>" : "", op.tamanho ? `<w:sz w:val="${op.tamanho}"/><w:szCs w:val="${op.tamanho}"/>` : ""].join("");
  return `<w:p><w:pPr>${props}</w:pPr><w:r><w:rPr>${run}</w:rPr><w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
}

/** Linha curta, sem ponto final e não é item de lista: tratada como título de seção. */
export function pareceTitulo(linha: string): boolean {
  const t = linha.trim();
  return t.length > 0 && t.length <= 80 && !/[.;:,]$/.test(t) && !/^[-•*]/.test(t) && t.split(/\s+/).length <= 10;
}

export function gerarDocx(d: DocumentoWord): Uint8Array {
  const corpo: string[] = [];
  if (d.escritorio) corpo.push(paragrafo(d.escritorio.toUpperCase(), { negrito: true, tamanho: 20, alinhamento: "center", espacoDepois: 240 }));
  corpo.push(paragrafo(d.titulo, { negrito: true, tamanho: 28, alinhamento: "center", espacoDepois: d.subtitulo ? 80 : 360 }));
  if (d.subtitulo) corpo.push(paragrafo(d.subtitulo, { tamanho: 20, alinhamento: "center", espacoDepois: 360 }));
  for (const bloco of d.texto.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const linhas = bloco.split("\n");
    if (linhas.length === 1 && pareceTitulo(linhas[0])) {
      corpo.push(paragrafo(linhas[0].trim(), { negrito: true, espacoDepois: 120 }));
      continue;
    }
    for (const l of linhas) if (l.trim()) corpo.push(paragrafo(l.trim(), { alinhamento: "both" }));
  }
  if (d.rodape) corpo.push(paragrafo(d.rodape, { tamanho: 16, espacoDepois: 0 }));

  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1134" w:bottom="1134" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`;
  return criarZip([
    {
      nome: "[Content_Types].xml",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    },
    {
      nome: "_rels/.rels",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    },
    {
      nome: "word/_rels/document.xml.rels",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { nome: "word/document.xml", conteudo: documento },
    { nome: "word/styles.xml", conteudo: estilos },
  ]);
}
