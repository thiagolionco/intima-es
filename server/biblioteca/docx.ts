import { inflateRawSync } from "node:zlib";

/** Teto do XML descompactado: protege contra arquivo .docx feito para explodir ao abrir. */
const MAX_XML = 30 * 1024 * 1024;

function lerEntrada(zip: Buffer, nomeProcurado: string): Buffer | null {
  // Fim do diretório central: assinatura 0x06054b50 nos últimos 64 KB + 22 bytes.
  let fim = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) return null;
  const total = zip.readUInt16LE(fim + 10);
  let p = zip.readUInt32LE(fim + 16);
  for (let n = 0; n < total; n++) {
    if (p + 46 > zip.length || zip.readUInt32LE(p) !== 0x02014b50) return null;
    const metodo = zip.readUInt16LE(p + 10);
    const compactado = zip.readUInt32LE(p + 20);
    const tamNome = zip.readUInt16LE(p + 28);
    const tamExtra = zip.readUInt16LE(p + 30);
    const tamComentario = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const nome = zip.subarray(p + 46, p + 46 + tamNome).toString("utf8");
    if (nome === nomeProcurado) {
      if (local + 30 > zip.length || zip.readUInt32LE(local) !== 0x04034b50) return null;
      const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const dados = zip.subarray(inicio, inicio + compactado);
      if (metodo === 0) return dados.length <= MAX_XML ? Buffer.from(dados) : null;
      if (metodo === 8) return inflateRawSync(dados, { maxOutputLength: MAX_XML });
      return null;
    }
    p += 46 + tamNome + tamExtra + tamComentario;
  }
  return null;
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodificar(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] !== "#") return ENTIDADES[e.toLowerCase()] ?? "";
    const cod = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(cod) && cod > 0 && cod <= 0x10ffff ? String.fromCodePoint(cod) : "";
  });
}

/** O começo de todo .docx (é um ZIP). */
export function ehZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Texto corrido de um .docx (Word), com um parágrafo por linha. Devolve null se o arquivo não for
 * um documento do Word válido.
 */
export function textoDoDocx(bytes: Uint8Array): string | null {
  if (!ehZip(bytes)) return null;
  let xml: Buffer | null;
  try {
    xml = lerEntrada(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), "word/document.xml");
  } catch {
    return null;
  }
  if (!xml) return null;
  const corpo = xml
    .toString("utf8")
    // Quebras de linha cruas no XML são só formatação; as do texto vêm de <w:p> e <w:br/>.
    .replace(/[\r\n]+/g, "")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:(br|cr)\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "");
  return decodificar(corpo)
    .split("\n")
    .map((l) => l.replace(/[ \u00a0]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
