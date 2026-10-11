import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";
import { enderecoDeRetorno } from "../retorno/endereco";

export const dynamic = "force-dynamic";

/** Leva à tela de consentimento do Google. */
export const GET = rotaAutenticada(async ({ usuario, req }) => NextResponse.redirect(container().agenda.iniciar(usuario.id, enderecoDeRetorno(req))));
