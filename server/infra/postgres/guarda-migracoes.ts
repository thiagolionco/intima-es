/**
 * Guarda das migrações: barra o que pode apagar ou expor dados dos clientes.
 *
 * Uma migração só pode acrescentar (tabela, coluna, índice, política). O que apaga, reescreve
 * ou desliga o isolamento entre escritórios precisa da linha
 *   -- mudanca-destrutiva-autorizada: <quem autorizou, quando e por quê>
 * no próprio arquivo, que fica no histórico do Git. Ver docs/seguranca/mudancas-seguras.md.
 */

export const MARCA_DE_AUTORIZACAO = "-- mudanca-destrutiva-autorizada:";

export interface Achado {
  regra: string;
  trecho: string;
}

const REGRAS: { regra: string; padrao: RegExp }[] = [
  { regra: "apaga tabela, schema, tipo ou visão", padrao: /\bDROP\s+(TABLE|SCHEMA|TYPE|VIEW|MATERIALIZED\s+VIEW|DATABASE|SEQUENCE|DOMAIN)\b/i },
  { regra: "apaga coluna", padrao: /\bDROP\s+COLUMN\b/i },
  { regra: "esvazia tabela", padrao: /\bTRUNCATE\b/i },
  { regra: "apaga linhas", padrao: /\bDELETE\s+FROM\b/i },
  { regra: "reescreve linhas existentes", padrao: /\bUPDATE\s+("?[\w.]+"?)\s+SET\b/i },
  { regra: "renomeia (quebra a versão do app que ainda está no ar)", padrao: /\bRENAME\b/i },
  { regra: "muda o tipo de coluna (pode cortar dados)", padrao: /\bALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/i },
  { regra: "desliga o isolamento entre escritórios", padrao: /\b(DISABLE|NO\s+FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/i },
  { regra: "apaga política de isolamento", padrao: /\bDROP\s+POLICY\b/i },
  { regra: "apaga em cascata", padrao: /\bDROP\b[^;]*\bCASCADE\s*$/i },
];

/** Tira comentários e textos entre aspas simples, para não acusar palavra dentro deles. */
function semComentariosNemTextos(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''");
}

/** Devolve o que a migração faz de perigoso. Vazio quando ela só acrescenta. */
export function analisarMigracao(sql: string): Achado[] {
  const limpo = semComentariosNemTextos(sql);
  const achados: Achado[] = [];
  for (const comando of limpo.split(";")) {
    for (const { regra, padrao } of REGRAS) {
      if (padrao.test(comando.trim())) achados.push({ regra, trecho: comando.replace(/\s+/g, " ").trim().slice(0, 160) });
    }
  }
  return achados;
}

export function autorizada(sql: string): boolean {
  return sql.split("\n").some((l) => l.trim().startsWith(MARCA_DE_AUTORIZACAO) && l.trim().length > MARCA_DE_AUTORIZACAO.length + 3);
}

export interface Arquivo {
  nome: string;
  sql: string;
}

export interface Resultado {
  erros: string[];
  avisos: string[];
}

/**
 * Compara as migrações do PR (`atuais`) com as da base (`anteriores`).
 * - Migração que já existia não pode mudar nem sumir: ela pode já estar aplicada na produção.
 * - Migração nova só passa se for aditiva ou trouxer a linha de autorização.
 * - Todo arquivo .sql precisa estar no _journal.json, e vice-versa.
 */
export function verificarMigracoes(anteriores: Arquivo[], atuais: Arquivo[], tagsDoJournal: string[]): Resultado {
  const erros: string[] = [];
  const avisos: string[] = [];
  const antes = new Map(anteriores.map((a) => [a.nome, a.sql]));
  const agora = new Map(atuais.map((a) => [a.nome, a.sql]));

  for (const [nome, sql] of antes) {
    if (!agora.has(nome)) erros.push(`${nome}: migração existente foi apagada. Ela pode já estar aplicada no banco dos clientes.`);
    else if (agora.get(nome) !== sql) erros.push(`${nome}: migração existente foi alterada. Crie uma migração nova em vez de mudar esta.`);
  }

  for (const [nome, sql] of agora) {
    if (antes.has(nome)) continue;
    const achados = analisarMigracao(sql);
    if (!achados.length) continue;
    const lista = achados.map((a) => `  · ${a.regra}: ${a.trecho}`).join("\n");
    if (autorizada(sql)) avisos.push(`${nome}: mudança destrutiva AUTORIZADA no arquivo:\n${lista}`);
    else erros.push(`${nome}: migração nova pode apagar ou expor dados dos clientes:\n${lista}\n  Para seguir, divida em passos só aditivos ou acrescente "${MARCA_DE_AUTORIZACAO} <quem, quando, por quê>" depois do backup conferido.`);
  }

  const nomesSql = new Set([...agora.keys()].map((n) => n.replace(/\.sql$/, "")));
  for (const tag of tagsDoJournal) if (!nomesSql.has(tag)) erros.push(`_journal.json cita ${tag}, mas drizzle/${tag}.sql não existe.`);
  for (const nome of nomesSql) if (!tagsDoJournal.includes(nome)) erros.push(`drizzle/${nome}.sql não está no _journal.json: o Drizzle não vai aplicá-la.`);

  return { erros, avisos };
}
