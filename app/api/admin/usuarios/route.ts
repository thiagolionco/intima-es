import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAdministrador } from "@/server/http/rota";

/** Todas as contas da plataforma, de todos os escritórios. Só para administradores. */
export const GET = rotaAdministrador(async ({ usuario }) => NextResponse.json({ contas: await container().administracao.listar(usuario.id) }));
