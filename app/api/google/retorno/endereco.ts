import type { NextRequest } from "next/server";
import { container } from "@/server/container";

/** Endereço de retorno do OAuth. Precisa estar cadastrado no Google Cloud exatamente assim. */
export function enderecoDeRetorno(req: NextRequest): string {
  return `${container().config.urlApp ?? req.nextUrl.origin}/api/google/retorno`;
}
