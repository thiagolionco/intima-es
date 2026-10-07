import { NextResponse } from "next/server";
import { AppError } from "@/server/core/errors";
import { container } from "@/server/container";
import { rotaPublica } from "@/server/http/rota";

export const dynamic = "force-dynamic";

function caixa() {
  const c = container();
  if (!c.config.caixaDeSaidaVisivel) throw new AppError("indisponivel", "Não disponível.");
  return c;
}

/** Caixa de saída de desenvolvimento: e-mails que seriam enviados (links de confirmação etc.). */
export const GET = rotaPublica(async () => {
  const c = caixa();
  return NextResponse.json({ provedor: c.config.email.provedor, emails: await c.caixaDeSaida.listar() });
});

export const DELETE = rotaPublica(async () => {
  await caixa().caixaDeSaida.limpar();
  return NextResponse.json({ ok: true });
});
