import { type AlertaPrecedente, type ImpactoAlerta, LIMITES_MONITOR, type MonitorPrecedentes, type StatusAlerta } from "../../lib/monitor.ts";
import { blocoDosPadroes } from "../../lib/padroes.ts";
import { AREA_LABEL, type AreaAtuacao, referencia } from "../../lib/processos.ts";
import { DIA, type Clock } from "../core/clock.ts";
import { novoId } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import type { ProcessoRepository } from "../processos/processos.ts";
import { idValido, nomeDoAutor, type Registro, type RegistrosRepository, textoLimpo } from "../registros/registros.ts";
import { falhaDaIa, semIa } from "./contexto-processo.ts";
import { DOMINIOS_OFICIAIS, perguntarJson, type ServicoIa } from "./ia.ts";
import type { PadroesService } from "./padroes.ts";

const INSTRUCOES = `Você acompanha a jurisprudência brasileira para um escritório de advocacia.
Recebe um tema e a data da última verificação. Pesquise nas fontes oficiais (STF, STJ, TST, tribunais, Planalto) o que saiu DEPOIS dessa data sobre o tema: súmulas novas ou canceladas, temas de repercussão geral ou repetitivos afetados ou julgados, mudanças de lei, decisões relevantes dos tribunais indicados.
Regras:
- Só inclua o que encontrou em fonte oficial nesta pesquisa, com a URL. Não invente.
- Sem novidade, devolva a lista vazia.
- impacto "alto" quando muda o entendimento ou afeta diretamente casos do tema; "medio" quando reforça ou detalha; "baixo" no resto.
- porQueImporta: uma frase sobre o efeito para quem atua no tema.
- No máximo ${LIMITES_MONITOR.alertasPorVerificacao} novidades.`;

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["novidades"],
  properties: {
    novidades: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["titulo", "resumo", "referencia", "tribunal", "data", "url", "impacto", "porQueImporta"],
        properties: {
          titulo: { type: "string" },
          resumo: { type: "string" },
          referencia: { type: "string" },
          tribunal: { type: "string" },
          data: { type: "string", description: "AAAA-MM-DD ou vazio." },
          url: { type: "string" },
          impacto: { type: "string", enum: ["baixo", "medio", "alto"] },
          porQueImporta: { type: "string" },
        },
      },
    },
  },
};

type ValorMonitor = Omit<MonitorPrecedentes, "id" | "criadoEm">;
type ValorAlerta = Omit<AlertaPrecedente, "id" | "criadoEm">;

const paraMonitor = (r: Registro<ValorMonitor>): MonitorPrecedentes => ({ ...r.valor, id: r.id, criadoEm: r.criadoEm });
const paraAlerta = (r: Registro<ValorAlerta>): AlertaPrecedente => ({ ...r.valor, id: r.id, criadoEm: r.criadoEm });

const urlOficial = (url: unknown): string | undefined => {
  if (typeof url !== "string") return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && DOMINIOS_OFICIAIS.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`)) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
};

/** Monitor de precedentes: temas que a IA pesquisa toda semana nas fontes oficiais. */
export class MonitorService {
  private readonly repo: RegistrosRepository;
  private readonly processos: ProcessoRepository;
  private readonly padroes: PadroesService;
  private readonly ia?: ServicoIa;
  private readonly clock: Clock;
  private readonly listarUsuarios: () => Promise<string[]>;
  private readonly escritorioDe: (usuarioId: string) => Promise<string | null>;

  constructor(d: {
    repo: RegistrosRepository;
    processos: ProcessoRepository;
    padroes: PadroesService;
    ia?: ServicoIa;
    clock: Clock;
    listarUsuarios?: () => Promise<string[]>;
    escritorioDe?: (usuarioId: string) => Promise<string | null>;
  }) {
    this.repo = d.repo;
    this.processos = d.processos;
    this.padroes = d.padroes;
    this.ia = d.ia;
    this.clock = d.clock;
    this.listarUsuarios = d.listarUsuarios ?? (async () => []);
    this.escritorioDe = d.escritorioDe ?? (async (id) => id);
  }

  get disponivel() {
    return !!this.ia;
  }

  async listar(usuarioId: string): Promise<MonitorPrecedentes[]> {
    return (await this.repo.listar<ValorMonitor>(usuarioId, "monitor")).map(paraMonitor).sort((a, b) => a.tema.localeCompare(b.tema, "pt-BR"));
  }

  private async lerCorpo(usuarioId: string, corpo: unknown) {
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    const tema = textoLimpo(c.tema, LIMITES_MONITOR.tema);
    if (!tema) throw new AppError("dados_invalidos", "Escreva o tema a acompanhar.", { campo: "tema" });
    const descricao = textoLimpo(c.descricao, LIMITES_MONITOR.descricao);
    const tribunais = (Array.isArray(c.tribunais) ? c.tribunais : typeof c.tribunais === "string" ? c.tribunais.split(",") : [])
      .flatMap((t) => (typeof t === "string" && /^[A-Za-z0-9 ]{2,10}$/.test(t.trim()) ? [t.trim().toUpperCase()] : []))
      .slice(0, LIMITES_MONITOR.tribunais);
    const visiveis = new Set((await this.processos.listar(usuarioId)).filter((p) => !p.particular).map((p) => p.id));
    const processoIds = (Array.isArray(c.processoIds) ? c.processoIds.filter(idValido) : []).filter((id) => visiveis.has(id));
    return {
      tema,
      ...(descricao ? { descricao } : {}),
      ...(typeof c.area === "string" && c.area in AREA_LABEL ? { area: c.area as AreaAtuacao } : {}),
      tribunais: [...new Set(tribunais)],
      processoIds,
      ativo: c.ativo !== false,
      frequenciaDias: [1, 7, 15, 30].includes(c.frequenciaDias as number) ? (c.frequenciaDias as number) : 7,
    };
  }

  async criar(autor: { id: string; nome: string }, corpo: unknown): Promise<MonitorPrecedentes> {
    const dados = await this.lerCorpo(autor.id, corpo);
    if ((await this.repo.listar(autor.id, "monitor")).length >= LIMITES_MONITOR.porEscritorio) throw new AppError("dados_invalidos", `Limite de ${LIMITES_MONITOR.porEscritorio} temas.`);
    const agora = this.clock.agora().toISOString();
    const r: Registro<ValorMonitor> = { id: novoId(), tipo: "monitor", valor: { ...dados, autorNome: nomeDoAutor(autor.nome) }, criadoEm: agora, atualizadoEm: agora };
    await this.repo.gravar(autor.id, r);
    return paraMonitor(r);
  }

  async atualizar(usuarioId: string, id: string, corpo: unknown): Promise<MonitorPrecedentes> {
    const atual = idValido(id) ? await this.repo.obter<ValorMonitor>(usuarioId, "monitor", id) : null;
    if (!atual) throw new AppError("nao_encontrado", "Tema não encontrado.");
    const dados = await this.lerCorpo(usuarioId, { ...atual.valor, ...(corpo as object) });
    const salvo = await this.repo.alterar<ValorMonitor>(usuarioId, "monitor", id, (r) => ({ ...r.valor, ...dados }), this.clock.agora().toISOString());
    if (!salvo) throw new AppError("nao_encontrado", "Tema não encontrado.");
    return paraMonitor(salvo);
  }

  /** Apaga o tema e os alertas dele. */
  async excluir(usuarioId: string, id: string) {
    if (!idValido(id) || !(await this.repo.excluir(usuarioId, "monitor", id))) throw new AppError("nao_encontrado", "Tema não encontrado.");
    for (const a of await this.repo.listar<ValorAlerta>(usuarioId, "alerta")) if (a.valor.monitorId === id) await this.repo.excluir(usuarioId, "alerta", a.id);
  }

  /** Pesquisa o tema agora. Devolve os alertas novos. */
  async verificar(usuarioId: string, id: string): Promise<AlertaPrecedente[]> {
    const ia = this.ia;
    if (!ia) throw semIa("O monitor de precedentes");
    const atual = idValido(id) ? await this.repo.obter<ValorMonitor>(usuarioId, "monitor", id) : null;
    if (!atual) throw new AppError("nao_encontrado", "Tema não encontrado.");
    const m = atual.valor;
    const agora = this.clock.agora();
    // Primeira vez: olha os últimos 90 dias.
    const desde = (m.ultimaVerificacao ?? new Date(agora.getTime() - 90 * DIA).toISOString()).slice(0, 10);
    const existentes = await this.repo.listar<ValorAlerta>(usuarioId, "alerta");
    const vistas = new Set(existentes.map((a) => a.valor.url));
    const padroes = await this.padroes.instrucoes(usuarioId, "monitor");
    const processos = m.processoIds.length ? (await this.processos.listar(usuarioId)).filter((p) => m.processoIds.includes(p.id)) : [];
    let novos: AlertaPrecedente[] = [];
    let erro: string | undefined;
    try {
      const { dados } = await perguntarJson<{ novidades: Record<string, unknown>[] }>(ia, {
        sistema: INSTRUCOES,
        esquema: ESQUEMA,
        pesquisaWeb: { maxUsos: 8, dominios: DOMINIOS_OFICIAIS },
        esforco: "medium",
        blocos: [
          {
            tipo: "texto",
            texto: [
              `Tema: ${m.tema}`,
              m.descricao && `O que interessa: ${m.descricao}`,
              m.area && `Área: ${AREA_LABEL[m.area]}`,
              `Tribunais: ${m.tribunais.length ? m.tribunais.join(", ") : "STF, STJ e TST"}`,
              processos.length && `Processos do escritório afetados: ${processos.map(referencia).join("; ")}`,
              `Última verificação: ${desde}. Hoje: ${agora.toISOString().slice(0, 10)}.`,
              vistas.size && `Já avisados (não repita):\n${[...vistas].slice(-40).join("\n")}`,
              blocoDosPadroes(padroes),
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
      });
      const criadoEm = agora.toISOString();
      for (const n of Array.isArray(dados.novidades) ? dados.novidades : []) {
        const url = urlOficial(n.url);
        const titulo = textoLimpo(n.titulo, 300);
        if (!url || !titulo || vistas.has(url)) continue;
        vistas.add(url);
        const ref = textoLimpo(n.referencia, 200);
        const tribunal = textoLimpo(n.tribunal, 40);
        const porQue = textoLimpo(n.porQueImporta, 500);
        const valor: ValorAlerta = {
          monitorId: id,
          tema: m.tema,
          titulo,
          resumo: textoLimpo(n.resumo, 1500) ?? "",
          ...(ref ? { referencia: ref } : {}),
          ...(tribunal ? { tribunal } : {}),
          ...(typeof n.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(n.data) ? { data: n.data } : {}),
          url,
          impacto: (["baixo", "medio", "alto"] as ImpactoAlerta[]).includes(n.impacto as ImpactoAlerta) ? (n.impacto as ImpactoAlerta) : "medio",
          ...(porQue ? { porQueImporta: porQue } : {}),
          processoIds: m.processoIds,
          status: "novo",
        };
        const r: Registro<ValorAlerta> = { id: novoId(), tipo: "alerta", valor, criadoEm, atualizadoEm: criadoEm };
        await this.repo.gravar(usuarioId, r);
        novos.push(paraAlerta(r));
        if (novos.length >= LIMITES_MONITOR.alertasPorVerificacao) break;
      }
    } catch (e) {
      erro = falhaDaIa("monitor", e).message;
    }
    // Lista de alertas não cresce sem fim: os arquivados mais antigos saem primeiro.
    const todos = [...existentes.map(paraAlerta), ...novos];
    if (todos.length > LIMITES_MONITOR.alertas) {
      const sobra = todos.sort((a, b) => (a.status === "arquivado" ? 0 : 1) - (b.status === "arquivado" ? 0 : 1) || a.criadoEm.localeCompare(b.criadoEm)).slice(0, todos.length - LIMITES_MONITOR.alertas);
      for (const a of sobra) await this.repo.excluir(usuarioId, "alerta", a.id);
      novos = novos.filter((n) => !sobra.includes(n));
    }
    await this.repo.alterar<ValorMonitor>(
      usuarioId,
      "monitor",
      id,
      (r) => {
        const { ultimoErro: _e, ...resto } = r.valor;
        return { ...resto, ultimaVerificacao: agora.toISOString(), ...(erro ? { ultimoErro: erro } : {}) };
      },
      agora.toISOString(),
    );
    if (erro) throw new AppError("indisponivel", erro);
    return novos;
  }

  async alertas(usuarioId: string): Promise<AlertaPrecedente[]> {
    return (await this.repo.listar<ValorAlerta>(usuarioId, "alerta")).map(paraAlerta).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }

  async alterarAlerta(usuarioId: string, id: string, corpo: unknown): Promise<AlertaPrecedente> {
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    const salvo = idValido(id)
      ? await this.repo.alterar<ValorAlerta>(
          usuarioId,
          "alerta",
          id,
          (r) => {
            const v = { ...r.valor };
            if ((["novo", "lido", "arquivado"] as StatusAlerta[]).includes(c.status as StatusAlerta)) v.status = c.status as StatusAlerta;
            if ("responsavelId" in c) {
              if (typeof c.responsavelId === "string" && c.responsavelId) v.responsavelId = c.responsavelId.slice(0, 64);
              else delete v.responsavelId;
            }
            return v;
          },
          this.clock.agora().toISOString(),
        )
      : null;
    if (!salvo) throw new AppError("nao_encontrado", "Alerta não encontrado.");
    return paraAlerta(salvo);
  }

  /** Para o agendador: verifica os temas vencidos, uma vez por escritório. */
  async rodarTodos(): Promise<{ verificados: number; alertas: number; erros: number }> {
    const r = { verificados: 0, alertas: 0, erros: 0 };
    if (!this.ia) return r;
    const escritorios = new Set<string>();
    const agora = this.clock.agora().getTime();
    for (const usuarioId of await this.listarUsuarios()) {
      const u = { id: usuarioId };
      const escritorio = await this.escritorioDe(u.id).catch(() => null);
      if (!escritorio || escritorios.has(escritorio)) continue;
      escritorios.add(escritorio);
      for (const m of await this.listar(u.id).catch(() => [])) {
        if (!m.ativo) continue;
        if (m.ultimaVerificacao && agora - Date.parse(m.ultimaVerificacao) < m.frequenciaDias * DIA - 2 * 60 * 60 * 1000) continue;
        try {
          r.alertas += (await this.verificar(u.id, m.id)).length;
          r.verificados++;
        } catch {
          r.erros++;
        }
      }
    }
    return r;
  }
}
