import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { container } from "@/server/container";
import { iguaisSeguro } from "@/server/core/crypto";
import { ETIQUETA_NEWS, lerNews } from "@/server/news/news";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Ronda diária da aba News: descarta o que estava guardado e lê de novo todos os feeds oficiais,
 * para a primeira pessoa do dia já abrir a aba atualizada. Exige `Authorization: Bearer <RONDA_TOKEN>`.
 */
export async function POST(req: NextRequest) {
  const token = container().config.comunica.rondaToken;
  const enviado = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return NextResponse.json({ erro: { codigo: "indisponivel", mensagem: "Não disponível." } }, { status: 404 });
  if (!iguaisSeguro(enviado, token)) return NextResponse.json({ erro: { codigo: "nao_autenticado", mensagem: "Token inválido." } }, { status: 401 });
  revalidateTag(ETIQUETA_NEWS);
  const { fontes } = await lerNews();
  const resumo = fontes.map((f) => ({ id: f.id, ok: f.ok, itens: f.itens.length, ...(f.erro ? { erro: f.erro } : {}) }));
  return NextResponse.json({ lidas: resumo.filter((f) => f.ok).length, total: resumo.length, fontes: resumo }, { headers: { "Cache-Control": "no-store" } });
}
