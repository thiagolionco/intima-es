import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { HashDeSenha } from "../auth/ports.ts";

function scryptAsync(senha: string, sal: Buffer, tamanho: number, opcoes: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(senha.normalize("NFKC"), sal, tamanho, opcoes, (erro, chave) => (erro ? reject(erro) : resolve(chave))));
}

/**
 * Hash de senha com scrypt (função lenta e com uso de memória, resistente a GPU).
 * Formato: scrypt$N$r$p$sal$hash (base64url), o que permite subir os parâmetros no futuro
 * sem invalidar senhas antigas.
 */
export class HashScrypt implements HashDeSenha {
  private readonly N: number;
  private readonly r = 8;
  private readonly p = 1;
  private readonly tamanho = 64;

  constructor(custo = 2 ** 15) {
    this.N = custo;
  }

  async gerar(senha: string): Promise<string> {
    const sal = randomBytes(16);
    const hash = await scryptAsync(senha, sal, this.tamanho, { N: this.N, r: this.r, p: this.p, maxmem: 128 * this.N * this.r * 2 });
    return ["scrypt", this.N, this.r, this.p, sal.toString("base64url"), hash.toString("base64url")].join("$");
  }

  async verificar(senha: string, armazenado: string): Promise<boolean> {
    const [alg, n, r, p, sal, hash] = armazenado.split("$");
    if (alg !== "scrypt" || !sal || !hash) return false;
    const esperado = Buffer.from(hash, "base64url");
    const N = Number(n);
    const calculado = await scryptAsync(senha, Buffer.from(sal, "base64url"), esperado.length, { N, r: Number(r), p: Number(p), maxmem: 128 * N * Number(r) * 2 });
    return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
  }
}
