import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Cifra segredos guardados no servidor (ex.: o acesso à Google Agenda) com AES-256-GCM. */
export class Cofre {
  private readonly chave: Buffer;

  constructor(segredo: string, finalidade: string) {
    if (segredo.length < 32) throw new Error("O segredo do cofre precisa ter ao menos 32 caracteres.");
    this.chave = createHash("sha256").update(`${finalidade}|${segredo}`).digest();
  }

  cifrar(texto: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.chave, iv);
    const corpo = Buffer.concat([c.update(texto, "utf8"), c.final()]);
    return [iv, c.getAuthTag(), corpo].map((b) => b.toString("base64url")).join(".");
  }

  decifrar(cifrado: string): string {
    const [iv, tag, corpo] = cifrado.split(".").map((p) => Buffer.from(p, "base64url"));
    const d = createDecipheriv("aes-256-gcm", this.chave, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(corpo), d.final()]).toString("utf8");
  }
}
