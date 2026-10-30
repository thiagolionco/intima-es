import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaPublicaComParams } from "@/server/http/rota";

type Params = { token: string };

/** O que o cliente vê no portal (sem login, pelo token do link). */
export const GET = rotaPublicaComParams<Params>(async ({ ctx }, { token }) => NextResponse.json({ portal: await container().portal.visao(token, ctx.ip) }, { headers: { "X-Robots-Tag": "noindex" } }));
