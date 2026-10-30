/** Dispara o download de um arquivo gerado no navegador. */
export function baixarArquivo(conteudo: Uint8Array | string, nomeArquivo: string, tipo: string): void {
  const blob = new Blob([conteudo as BlobPart], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nome de arquivo sem caracteres que o Windows recusa. */
export const nomeDeArquivo = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "documento";

export const TIPO_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
