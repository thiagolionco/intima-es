import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Inicia a configuração: devolve o segredo e o QR code para o aplicativo autenticador. */
export const POST = rotaAutenticada(async ({ usuario }) => {
  const { segredo, uri } = await container().doisFatores.iniciar(usuario.id);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: "M" });
  return NextResponse.json({ segredo, uri, qr });
});
