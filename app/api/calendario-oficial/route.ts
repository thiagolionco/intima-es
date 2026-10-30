import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** A leitura pela IA pode levar alguns minutos. */
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

/** O calendário é público e igual para todos os escritórios: a leitura fica guardada por uma semana. */
const SEMANA = 7 * 24 * 3600;

/** Dias sem expediente do calendário publicado pelo tribunal: ?tribunal=TRT9&ano=2026. */
export const GET = rotaAutenticada(async ({ usuario, req }) => {
  const servico = container().calendarioOficial;
  if (!servico.disponivel) return NextResponse.json({ disponivel: false });
  const p = new URL(req.url).searchParams;
  const { tribunal, ano } = servico.validar(p.get("tribunal"), p.get("ano"));
  // A chave é só o tribunal e o ano (o usuário fica fora dela): a mesma leitura serve a todos.
  // Falha não fica guardada, então a próxima tentativa lê de novo.
  const calendario = await unstable_cache(() => servico.ler(usuario.id, tribunal, ano), ["calendario-oficial-v1", tribunal, String(ano)], { revalidate: SEMANA, tags: ["calendario-oficial"] })();
  return NextResponse.json({ disponivel: true, calendario });
});
