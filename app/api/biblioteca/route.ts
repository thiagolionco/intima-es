import { NextResponse } from "next/server";
import { LIMITES_BIBLIOTECA } from "@/lib/biblioteca";
import { AppError } from "@/server/core/errors";
import { container } from "@/server/container";
import { rotaAutenticada } from "@/server/http/rota";

/** Itens da biblioteca do escritório, os mexidos por último primeiro. */
export const GET = rotaAutenticada(async ({ usuario }) => NextResponse.json({ itens: await container().biblioteca.listar(usuario.id) }));

/** Novo item (multipart): campo "dados" com o JSON do item e, opcional, "arquivo" (PDF ou .docx). */
export const POST = rotaAutenticada(async ({ usuario, req }) => {
  const declarado = Number(req.headers.get("content-length") || 0);
  // Folga para os cabeçalhos do multipart e para o texto colado; o arquivo em si é conferido no serviço.
  if (declarado > LIMITES_BIBLIOTECA.bytes + 512 * 1024) throw new AppError("dados_invalidos", `O arquivo passa de ${LIMITES_BIBLIOTECA.bytes / (1024 * 1024)} MB.`);
  const form = await req.formData().catch(() => {
    throw new AppError("dados_invalidos", "Envio inválido.");
  });
  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(String(form.get("dados") ?? "{}"));
  } catch {
    throw new AppError("dados_invalidos", "Envio inválido.");
  }
  const arquivo = form.get("arquivo");
  const item = await container().biblioteca.criar(
    { id: usuario.id, nome: usuario.nome },
    dados && typeof dados === "object" ? dados : {},
    arquivo instanceof File && arquivo.size ? { nome: arquivo.name, bytes: new Uint8Array(await arquivo.arrayBuffer()) } : undefined,
  );
  return NextResponse.json({ item }, { status: 201 });
});
