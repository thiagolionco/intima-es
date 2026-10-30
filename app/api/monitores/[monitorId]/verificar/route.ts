import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** A IA pode levar alguns minutos. */
// 300 s é o teto do plano grátis da Vercel (fora dela o valor não tem efeito).
export const maxDuration = 300;

type Params = { monitorId: string };

/** Pesquisa o tema agora. */
export const POST = rotaAutenticada<Params>(async ({ usuario }, { monitorId }) => {
  const c = container();
  c.limitador.consumir(`monitor:${usuario.id}`, 20, 24 * 60 * 60 * 1000);
  return NextResponse.json({ alertas: await c.monitor.verificar(usuario.id, monitorId) });
});
