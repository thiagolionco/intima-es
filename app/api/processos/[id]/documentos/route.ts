import { NextResponse } from "next/server";
import { LIMITES_DOCUMENTO } from "@/lib/processos";
import { AppError } from "@/server/core/errors";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

type Params = { id: string };

/** PDFs anexados ao processo. */
export const GET = rotaAutenticada<Params>(async ({ usuario }, { id }) => NextResponse.json({ documentos: await container().documentosProcesso.listar(usuario.id, id) }));

/** Envio de um PDF (multipart, campo "arquivo"). */
export const POST = rotaAutenticada<Params>(async ({ usuario, req }, { id }) => {
  const declarado = Number(req.headers.get("content-length") || 0);
  // Folga para os cabeçalhos do multipart; o tamanho do arquivo em si é conferido no serviço.
  if (declarado > LIMITES_DOCUMENTO.bytes + 64 * 1024) throw new AppError("dados_invalidos", `O arquivo passa de ${LIMITES_DOCUMENTO.bytes / (1024 * 1024)} MB.`);
  const form = await req.formData().catch(() => {
    throw new AppError("dados_invalidos", "Envio inválido.");
  });
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File)) throw new AppError("dados_invalidos", "Escolha um arquivo PDF.");
  const documento = await container().documentosProcesso.enviar(usuario.id, id, { nome: arquivo.name, bytes: new Uint8Array(await arquivo.arrayBuffer()) });
  return NextResponse.json({ documento }, { status: 201 });
});
