import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { rotaPublicaComParams } from "@/server/http/rota";

type Params = { token: string; processoId: string; documentoId: string };

/** PDF que o escritório compartilhou no portal. */
export const GET = rotaPublicaComParams<Params>(async ({ ctx }, { token, processoId, documentoId }) => {
  const { documento, bytes } = await container().portal.documento(token, ctx.ip, processoId, documentoId);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(documento.nome)}`,
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
});
