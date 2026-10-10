import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

/** Token opaco, imprevisível (256 bits), seguro para URL. */
export function tokenAleatorio(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Guardamos apenas o hash dos tokens: um vazamento da base não permite reutilizá-los. */
export function sha256(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

export function novoId(): string {
  return randomUUID();
}

/** Comparação em tempo constante para strings (evita ataques de temporização). */
export function iguaisSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}
