import { NextResponse, type NextRequest } from "next/server";
import { container } from "@/server/container";
import { iguaisSeguro } from "@/server/core/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Avisos de prazo de todas as contas e, em seguida, a Google Agenda (como o agendador interno faz
 * de hora em hora), para um agendador externo. Mesma autenticação de /api/rondas/comunica.
 */
export async function POST(req: NextRequest) {
  const { config, avisos, agenda } = container();
  const token = config.comunica.rondaToken;
  const enviado = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return NextResponse.json({ erro: { codigo: "indisponivel", mensagem: "Não disponível." } }, { status: 404 });
  if (!iguaisSeguro(enviado, token)) return NextResponse.json({ erro: { codigo: "nao_autenticado", mensagem: "Token inválido." } }, { status: 401 });
  const resultado = await avisos.rodar();
  await agenda.rodar().catch((e) => console.error("[agenda] falhou:", e));
  return NextResponse.json(resultado, { headers: { "Cache-Control": "no-store" } });
}
