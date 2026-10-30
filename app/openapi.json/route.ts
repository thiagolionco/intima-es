import { especificacaoOpenApi } from "@/lib/publico/arquivos";

export const dynamic = "force-static";

export function GET() {
  return Response.json(especificacaoOpenApi(), { headers: { "Access-Control-Allow-Origin": "*" } });
}
