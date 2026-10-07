import { NextResponse } from "next/server";
import { paraPublico } from "@/server/auth/model";
import { rotaAutenticada } from "@/server/http/rota";

/** Quem está logado. Usado pela interface ao abrir a aplicação. */
export const GET = rotaAutenticada(async ({ usuario, sessao }) =>
  NextResponse.json({ usuario: paraPublico(usuario), sessao: { expiraEm: sessao.expiraEm, lembrar: sessao.lembrar } }),
);
