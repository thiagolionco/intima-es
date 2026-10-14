import { NextResponse, type NextRequest } from "next/server";
import { container } from "@/server/container";
import { iguaisSeguro } from "@/server/core/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Alarme de vigília parada, para um agendador de fora do app (GitHub Actions): responde 200 com a
 * saúde da busca automática, ou 503 quando ela parou (passou o dobro do intervalo sem ronda).
 * Mesma autenticação das demais rotas de ronda.
 */
export async function GET(req: NextRequest) {
  const { config, rondaComunica } = container();
  const token = config.comunica.rondaToken;
  const enviado = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return NextResponse.json({ erro: { codigo: "indisponivel", mensagem: "Não disponível." } }, { status: 404 });
  if (!iguaisSeguro(enviado, token)) return NextResponse.json({ erro: { codigo: "nao_autenticado", mensagem: "Token inválido." } }, { status: 401 });
  if (!config.comunica.rondaLigada) return NextResponse.json({ ligada: false, atrasada: false }, { headers: { "Cache-Control": "no-store" } });
  const saude = await rondaComunica.saude(config.comunica.rondaIntervaloHoras);
  return NextResponse.json({ ligada: true, ...saude }, { status: saude.atrasada ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
