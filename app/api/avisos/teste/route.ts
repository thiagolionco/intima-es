import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Manda agora, para o próprio e-mail, o aviso com os prazos que estão chegando. */
export const POST = rotaAutenticada(async ({ usuario }) => NextResponse.json({ prazos: await container().avisos.daConta(usuario.id, { forcar: true }) }));
