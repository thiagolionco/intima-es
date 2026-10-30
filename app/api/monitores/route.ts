import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

export const GET = rotaAutenticada(async ({ usuario }) => {
  const c = container();
  const [monitores, alertas] = await Promise.all([c.monitor.listar(usuario.id), c.monitor.alertas(usuario.id)]);
  return NextResponse.json({ monitores, alertas, disponivel: c.monitor.disponivel });
});

/** Novo tema: { tema, descricao?, area?, tribunais?, processoIds?, frequenciaDias? }. */
export const POST = rotaAutenticada(async ({ usuario, corpo }) =>
  NextResponse.json({ monitor: await container().monitor.criar({ id: usuario.id, nome: usuario.nome }, await corpo()) }, { status: 201 }),
);
