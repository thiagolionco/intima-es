import { eq } from "drizzle-orm";
import type { EventoAuditoria, Sessao, TokenVerificacao, Usuario } from "../../auth/model.ts";
import type { Clock } from "../../core/clock.ts";
import type { EspacoTrabalho } from "../../workspace/espaco-trabalho.ts";
import type { ArmazenamentoDocumentos } from "../armazenamento.ts";
import type { BancoDeDados } from "./conexao.ts";
import { comEscritorio } from "./contexto.ts";
import { SessaoRepositoryPostgres, TokenRepositoryPostgres, UsuarioRepositoryPostgres } from "./repositorios.ts";
import { auditoria, espacosTrabalho } from "./schema.ts";

export interface ResultadoImportacao {
  importados: string[];
  ignorados: { email: string; motivo: string }[];
  intimacoes: number;
  eventos: number;
  sessoes: number;
}

/**
 * Copia os dados da versão em arquivos (.data/) para o Postgres. Cada conta vira dona do
 * próprio escritório, com o espaço de trabalho dela. Contas que já existem no banco (mesmo
 * e-mail) são deixadas como estão, então rodar de novo não duplica nada.
 */
export async function importarDeDocumentos(origem: ArmazenamentoDocumentos, db: BancoDeDados, clock: Clock): Promise<ResultadoImportacao> {
  const usuariosRepo = new UsuarioRepositoryPostgres(db);
  const sessoesRepo = new SessaoRepositoryPostgres(db, clock);
  const tokensRepo = new TokenRepositoryPostgres(db, clock);
  const agora = clock.agora().toISOString();

  const lista = await origem.ler<Usuario[]>("usuarios", []);
  const sessoes = (await origem.ler<Sessao[]>("sessoes", [])).filter((s) => s.expiraEm > agora);
  const tokens = (await origem.ler<TokenVerificacao[]>("tokens", [])).filter((t) => t.expiraEm > agora);
  const r: ResultadoImportacao = { importados: [], ignorados: [], intimacoes: 0, eventos: 0, sessoes: 0 };

  for (const u of lista) {
    if (await usuariosRepo.porEmail(u.email)) {
      r.ignorados.push({ email: u.email, motivo: "já existe no banco" });
      continue;
    }
    await usuariosRepo.criar(u);

    const espaco = await origem.ler<EspacoTrabalho | null>(`espacos/${u.id}`, null);
    if (espaco) {
      await comEscritorio(db, u.id, async (tx, escritorioId) => {
        if (!escritorioId) throw new Error(`Conta ${u.email} ficou sem escritório na importação.`);
        await tx
          .update(espacosTrabalho)
          .set({
            intimacoes: espaco.intimacoes,
            termos: espaco.termos,
            revisao: espaco.revisao,
            atualizadoEm: espaco.atualizadoEm ? new Date(espaco.atualizadoEm) : null,
          })
          .where(eq(espacosTrabalho.escritorioId, escritorioId));
      });
      r.intimacoes += espaco.intimacoes.length;
    }

    // O arquivo guarda do mais novo para o mais antigo; gravamos em ordem cronológica.
    const eventos = (await origem.ler<EventoAuditoria[]>(`auditoria/${u.id}`, [])).slice().reverse();
    for (const e of eventos) {
      await db.insert(auditoria).values({ id: e.id, usuarioId: u.id, tipo: e.tipo, em: new Date(e.em), ip: e.ip, userAgent: e.userAgent, detalhe: e.detalhe ?? null });
    }
    r.eventos += eventos.length;

    for (const s of sessoes.filter((s) => s.usuarioId === u.id)) {
      await sessoesRepo.salvar(s);
      r.sessoes++;
    }
    for (const t of tokens.filter((t) => t.usuarioId === u.id)) await tokensRepo.salvar(t);

    r.importados.push(u.email);
  }
  return r;
}
