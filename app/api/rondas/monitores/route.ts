import { NextResponse, type NextRequest } from "next/server";
import { container } from "@/server/container";
import { iguaisSeguro } from "@/server/core/crypto";

export const dynamic = "force-dynamic";
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

/**
 * Monitor de precedentes: pesquisa os temas vencidos de todos os escritórios, para um agendador externo.
 * Exige `Authorization: Bearer <RONDA_TOKEN>`; sem RONDA_TOKEN configurado a rota não existe.
 */
export async function POST(req: NextRequest) {
  const { config, monitor } = container();
  const token = config.comunica.rondaToken;
  const enviado = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return NextResponse.json({ erro: { codigo: "indisponivel", mensagem: "Não disponível." } }, { status: 404 });
  if (!iguaisSeguro(enviado, token)) return NextResponse.json({ erro: { codigo: "nao_autenticado", mensagem: "Token inválido." } }, { status: 401 });
  return NextResponse.json(await monitor.rodarTodos(), { headers: { "Cache-Control": "no-store" } });
}
