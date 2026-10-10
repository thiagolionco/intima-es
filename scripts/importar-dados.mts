/**
 * Copia os dados de .data/ (versão em arquivos) para o banco de DATABASE_URL.
 * Uso: npm run db:importar   (rode antes npm run db:migrar)
 * Pode rodar de novo: contas que já estão no banco são deixadas como estão.
 */
import path from "node:path";
import { relogioDoSistema } from "../server/core/clock.ts";
import { ArmazenamentoEmArquivo } from "../server/infra/armazenamento.ts";
import { conectar } from "../server/infra/postgres/conexao.ts";
import { importarDeDocumentos } from "../server/infra/postgres/importar.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL (veja .env.example).");
  process.exit(1);
}
const pasta = path.resolve(process.env.DATA_DIR || ".data");
console.log(`Lendo ${pasta}`);
const conexao = conectar(url, 1);
try {
  const r = await importarDeDocumentos(new ArmazenamentoEmArquivo(pasta), conexao.db, relogioDoSistema);
  console.log(`Contas importadas: ${r.importados.length}${r.importados.length ? ` (${r.importados.join(", ")})` : ""}`);
  for (const i of r.ignorados) console.log(`Ignorada: ${i.email} (${i.motivo})`);
  console.log(`Intimações: ${r.intimacoes} · eventos de auditoria: ${r.eventos} · sessões ativas: ${r.sessoes}`);
} finally {
  await conexao.encerrar();
}
