import { NextResponse } from "next/server";
import { TIPO_MIME } from "@/lib/biblioteca";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { itemId: string };

/** Abre o arquivo do item (PDF no navegador; Word sempre baixa). Passa pelo app, que confere o escritório. */
export const GET = rotaAutenticada<Params>(async ({ usuario, req }, { itemId }) => {
  const { arquivo, bytes } = await container().biblioteca.abrir(usuario.id, itemId);
  const modo = req.nextUrl.searchParams.get("baixar") || arquivo.formato !== "pdf" ? "attachment" : "inline";
  const nomeAscii = arquivo.nome.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "") || `documento.${arquivo.formato}`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": TIPO_MIME[arquivo.formato],
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${modo}; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(arquivo.nome)}`,
    },
  });
});

/** Edita os dados do item (o arquivo não muda). */
export const PATCH = rotaAutenticada<Params>(
  async ({ usuario, corpo }, { itemId }) => NextResponse.json({ item: await container().biblioteca.atualizar(usuario.id, itemId, await corpo()) }),
  // 50 mil caracteres podem passar de 64 KB em UTF-8 (acentos ocupam 2 bytes).
  { limiteCorpo: 256 * 1024 },
);

export const DELETE = rotaAutenticada<Params>(async ({ usuario }, { itemId }) => {
  await container().escritorio.exigir(usuario.id, "excluir");
  await container().biblioteca.excluir(usuario.id, itemId);
  return NextResponse.json({ ok: true });
});
