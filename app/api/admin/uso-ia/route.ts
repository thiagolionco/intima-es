import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAdministrador } from "@/server/http/rota";

/** Uso da IA de todos os escritórios no mês (?mes=AAAA-MM; sem ele, o mês atual). Só para administradores. */
export const GET = rotaAdministrador(async ({ usuario, req }) => NextResponse.json(await container().administracao.usoIa(usuario.id, req.nextUrl.searchParams.get("mes"))));
