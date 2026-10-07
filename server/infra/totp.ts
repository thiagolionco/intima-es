import { createHmac, randomBytes } from "node:crypto";
import type { SegundoFator } from "../auth/ports.ts";
import type { Clock } from "../core/clock.ts";

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Codificar(buf: Buffer): string {
  let bits = 0;
  let valor = 0;
  let saida = "";
  for (const byte of buf) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

export function base32Decodificar(texto: string): Buffer {
  const limpo = texto.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const c of limpo) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) throw new Error("Segredo base32 inválido.");
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** HOTP (RFC 4226). */
export function hotp(segredo: Buffer, contador: number, digitos = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(contador));
  const hmac = createHmac("sha1", segredo).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const codigo = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digitos;
  return codigo.toString().padStart(digitos, "0");
}

/**
 * TOTP (RFC 6238), compatível com Google Authenticator, Microsoft Authenticator, Authy e
 * 1Password. Aceita uma janela de ±1 intervalo de 30 s para tolerar relógios desajustados.
 */
export class Totp implements SegundoFator {
  private readonly clock: Clock;
  private readonly passo = 30;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  gerarSegredo(): string {
    return base32Codificar(randomBytes(20));
  }

  uriDeConfiguracao(segredo: string, conta: string, emissor: string): string {
    const rotulo = `${encodeURIComponent(emissor)}:${encodeURIComponent(conta)}`;
    const params = new URLSearchParams({ secret: segredo, issuer: emissor, algorithm: "SHA1", digits: "6", period: String(this.passo) });
    return `otpauth://totp/${rotulo}?${params.toString()}`;
  }

  codigoAtual(segredo: string): string {
    return hotp(base32Decodificar(segredo), Math.floor(this.clock.agora().getTime() / 1000 / this.passo));
  }

  /** Devolve o intervalo (passo) do código aceito, para impedir que seja reutilizado. */
  verificar(segredo: string, codigo: string): number | null {
    const limpo = codigo.replace(/\D/g, "");
    if (limpo.length !== 6) return null;
    const chave = base32Decodificar(segredo);
    const contador = Math.floor(this.clock.agora().getTime() / 1000 / this.passo);
    let aceito: number | null = null;
    for (const delta of [-1, 0, 1]) if (hotp(chave, contador + delta) === limpo) aceito = contador + delta;
    return aceito;
  }
}
