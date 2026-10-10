/** Aplica as migrações pendentes no banco de DATABASE_URL. Uso: npm run db:migrar */
import { conectar, migrar } from "../server/infra/postgres/conexao.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL (veja .env.example).");
  process.exit(1);
}
const conexao = conectar(url, 1);
try {
  await migrar(conexao.db);
  console.log("Migrações aplicadas.");
} finally {
  await conexao.encerrar();
}
