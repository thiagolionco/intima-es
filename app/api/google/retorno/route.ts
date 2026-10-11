import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { AppError } from "@/server/core/errors";
import { rotaAutenticada } from "@/server/http/rota";
import { enderecoDeRetorno } from "./endereco";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Volta do consentimento do Google: guarda o acesso e manda os prazos para a agenda. */
export const GET = rotaAutenticada(async ({ usuario, req }) => {
  const p = req.nextUrl.searchParams;
  const destino = new URL("/prazos", container().config.urlApp ?? req.nextUrl.origin);
  try {
    if (p.get("error")) throw new AppError("dados_invalidos", p.get("error") === "access_denied" ? "Você não autorizou o acesso à agenda." : "O Google não concluiu a conexão.");
    await container().agenda.concluir(usuario.id, p.get("state") ?? "", p.get("code") ?? "", enderecoDeRetorno(req));
    destino.searchParams.set("google", "conectado");
  } catch (e) {
    if (!(e instanceof AppError)) console.error("[agenda] falha ao conectar:", e);
    destino.searchParams.set("google", "erro");
    destino.searchParams.set("motivo", e instanceof Error ? e.message.slice(0, 200) : "Não foi possível conectar.");
  }
  return NextResponse.redirect(destino);
});
