import { createHmac } from "node:crypto";
import { iguaisSeguro } from "./crypto.ts";

/**
 * Links assinados (HMAC-SHA256) para ações por e-mail sem login, como "Já cumpri".
 * O conteúdo vai legível, mas não pode ser alterado nem forjado sem o segredo.
 */
export class AssinadorDeLinks {
  private readonly segredo: string;

  constructor(segredo: string) {
    if (segredo.length < 32) throw new Error("O segredo dos links precisa ter ao menos 32 caracteres.");
    this.segredo = segredo;
  }

  private assinatura(corpo: string) {
    return createHmac("sha256", this.segredo).update(corpo).digest("base64url");
  }

  assinar(dados: Record<string, unknown>, expiraEm: Date): string {
    const corpo = Buffer.from(JSON.stringify({ ...dados, exp: expiraEm.getTime() })).toString("base64url");
    return `${corpo}.${this.assinatura(corpo)}`;
  }

  /** Devolve os dados se o token for autêntico e estiver no prazo; null caso contrário. */
  verificar<T extends Record<string, unknown>>(token: string, agora: Date): T | null {
    const [corpo, assinatura, ...resto] = (token ?? "").split(".");
    if (!corpo || !assinatura || resto.length || !iguaisSeguro(assinatura, this.assinatura(corpo))) return null;
    try {
      const dados = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as T & { exp?: number };
      if (typeof dados.exp !== "number" || dados.exp < agora.getTime()) return null;
      return dados;
    } catch {
      return null;
    }
  }
}
