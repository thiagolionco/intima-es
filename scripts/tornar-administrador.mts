/**
 * Concede (ou, com --retirar, retira) o papel de administrador da plataforma a uma conta.
 * É o jeito de criar o primeiro administrador; os seguintes podem ser criados pela tela.
 * Uso: npm run admin:promover -- pessoa@escritorio.com.br [--retirar]
 */
import path from "node:path";
import { normalizarEmail } from "../server/auth/model.ts";
import type { UsuarioRepository } from "../server/auth/ports.ts";
import { ArmazenamentoEmArquivo } from "../server/infra/armazenamento.ts";
import { conectar } from "../server/infra/postgres/conexao.ts";
import { UsuarioRepositoryPostgres } from "../server/infra/postgres/repositorios.ts";
import { UsuarioRepositoryDocumentos } from "../server/infra/repositorios.ts";

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"));
const administrador = !args.includes("--retirar");
if (!email) {
  console.error("Informe o e-mail da conta: npm run admin:promover -- pessoa@escritorio.com.br [--retirar]");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
const conexao = url ? conectar(url, 1) : null;
const usuarios: UsuarioRepository = conexao
  ? new UsuarioRepositoryPostgres(conexao.db)
  : new UsuarioRepositoryDocumentos(new ArmazenamentoEmArquivo(path.resolve(process.env.DATA_DIR || ".data")));
try {
  const conta = await usuarios.porEmail(normalizarEmail(email));
  if (!conta) {
    console.error(`Nenhuma conta com o e-mail ${email}.`);
    process.exitCode = 1;
  } else {
    await usuarios.atualizar(conta.id, { administrador });
    console.log(`${conta.nome} (${conta.email}) ${administrador ? "agora é administrador da plataforma" : "deixou de ser administrador"}.`);
  }
} finally {
  await conexao?.encerrar();
}
