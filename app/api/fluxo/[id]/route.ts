import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Ficha do caso: processo, estado na Central e trilha de auditoria. */
export const GET = rotaAutenticada<{ id: string }>(async ({ usuario }, { id }) => NextResponse.json(await container().fluxo.ficha(usuario.id, id)));
