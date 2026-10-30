import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaPublicaComParams } from "@/server/http/rota";

type Params = { token: string };

/** Mensagem do cliente ao escritório: { assunto, mensagem, contato?, processoId? }. Chega em Pedidos. */
export const POST = rotaPublicaComParams<Params>(async ({ ctx, corpo }, { token }) => {
  await container().portal.mensagem(token, ctx.ip, await corpo());
  return NextResponse.json({ ok: true }, { status: 201 });
}, { limiteCorpo: 32 * 1024 });
