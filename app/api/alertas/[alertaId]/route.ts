import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { alertaId: string };

/** { status?, responsavelId? }. */
export const PATCH = rotaAutenticada<Params>(async ({ usuario, corpo }, { alertaId }) =>
  NextResponse.json({ alerta: await container().monitor.alterarAlerta(usuario.id, alertaId, await corpo()) }),
);
