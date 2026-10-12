import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { id: string; documentoId: string };

/** Abre o PDF no navegador (ou baixa, com ?baixar=1). Sempre passa pelo app, que confere o escritório. */
export const GET = rotaAutenticada<Params>(async ({ usuario, req }, { id, documentoId }) => {
  const { documento, bytes } = await container().documentosProcesso.abrir(usuario.id, id, documentoId);
  const modo = req.nextUrl.searchParams.get("baixar") ? "attachment" : "inline";
  const nomeAscii = documento.nome.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "") || "documento.pdf";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${modo}; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(documento.nome)}`,
    },
  });
});

export const DELETE = rotaAutenticada<Params>(async ({ usuario }, { id, documentoId }) => {
  await container().documentosProcesso.excluir(usuario.id, id, documentoId);
  return NextResponse.json({ ok: true });
});
