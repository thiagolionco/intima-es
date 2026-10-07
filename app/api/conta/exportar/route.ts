import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const GET = rotaAutenticada(async ({ usuario, ctx }) => {
  const dados = await container().conta.exportar(usuario.id, ctx);
  return new NextResponse(JSON.stringify(dados, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="meus-dados-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
