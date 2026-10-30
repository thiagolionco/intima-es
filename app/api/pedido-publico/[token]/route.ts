import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaPublicaComParams } from "@/server/http/rota";

type Params = { token: string };

/** Título e apresentação do formulário público do escritório. */
export const GET = rotaPublicaComParams<Params>(async (_r, { token }) => {
  const c = container();
  return NextResponse.json({ formulario: await c.pedidos.formularioPublico(token, c.nomeDoEscritorio) }, { headers: { "X-Robots-Tag": "noindex" } });
});

/** Envio do formulário: { nome, contato, assunto, descricao, aceite }. */
export const POST = rotaPublicaComParams<Params>(async ({ ctx, corpo }, { token }) => {
  await container().pedidos.receberDoFormulario(token, await corpo(), ctx.ip);
  return NextResponse.json({ ok: true }, { status: 201 });
}, { limiteCorpo: 32 * 1024 });
