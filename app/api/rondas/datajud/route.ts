import { NextResponse, type NextRequest } from "next/server";
import { container } from "@/server/container";
import { iguaisSeguro } from "@/server/core/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

/**
 * Andamentos no DataJud de todos os processos, para um agendador externo (cron do provedor, GitHub Actions…).
 * Exige `Authorization: Bearer <RONDA_TOKEN>`; sem RONDA_TOKEN configurado a rota não existe.
 */
export async function POST(req: NextRequest) {
  const { config, movimentacoes } = container();
  const token = config.comunica.rondaToken;
  const enviado = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return NextResponse.json({ erro: { codigo: "indisponivel", mensagem: "Não disponível." } }, { status: 404 });
  if (!iguaisSeguro(enviado, token)) return NextResponse.json({ erro: { codigo: "nao_autenticado", mensagem: "Token inválido." } }, { status: 401 });
  return NextResponse.json(await movimentacoes.rodarTodos(), { headers: { "Cache-Control": "no-store" } });
}
