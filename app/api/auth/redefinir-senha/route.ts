import { NextResponse } from "next/server";
import { AppError } from "@/server/core/errors";
import { container } from "@/server/container";
import { rotaPublica } from "@/server/http/rota";

/** POST com só o token confere se o link ainda vale; com a senha, conclui a redefinição. */
export const POST = rotaPublica(async ({ corpo, ctx }) => {
  const { token, senha } = await corpo<{ token: string; senha?: string }>();
  const c = container();
  if (senha === undefined) {
    const valido = await c.recuperacao.verificarToken(token);
    if (!valido) throw new AppError("token_invalido", "Este link de redefinição é inválido ou expirou. Peça um novo.");
    return NextResponse.json(valido);
  }
  return NextResponse.json(await c.recuperacao.redefinir(token, senha, ctx));
});
