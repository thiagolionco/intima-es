import { SITUACAO_CITACAO_LABEL, contarPendencias } from "../../lib/citacoes.ts";
import { IDIOMA_LABEL } from "../../lib/editor.ts";
import {
  type DadosFluxo,
  exigeProcessos,
  FERRAMENTA_FLUXO_LABEL,
  type ExecucaoFluxo,
  type FluxoIa,
  LIMITES_FLUXO_IA,
  type PassoFluxo,
  passoAtual,
  type ResultadoPasso,
  ultimoTexto,
  validarFluxo,
} from "../../lib/fluxos-ia.ts";
import { blocoDosPadroes } from "../../lib/padroes.ts";
import { referencia } from "../../lib/processos.ts";
import { formatProcesso } from "../../lib/utils.ts";
import type { BibliotecaService } from "../biblioteca/biblioteca.ts";
import type { Clock } from "../core/clock.ts";
import { novoId } from "../core/crypto.ts";
import { AppError } from "../core/errors.ts";
import type { ProcessoRepository } from "../processos/processos.ts";
import { idValido, nomeDoAutor, type Registro, type RegistrosRepository, textoLimpo } from "../registros/registros.ts";
import type { CitacoesService } from "./citacoes.ts";
import { type ContextoProcesso, descreverProcesso, Exclusivo, falhaDaIa, semIa } from "./contexto-processo.ts";
import { INSTRUCOES_TRADUCAO } from "./editor.ts";
import type { BlocoIa, ServicoIa } from "./ia.ts";
import type { PadroesService } from "./padroes.ts";
import type { PesquisaService } from "./pesquisa.ts";
import type { RevisoesService } from "./revisoes.ts";

const INSTRUCOES_PASSO = `Você executa um passo de um fluxo de trabalho de um escritório de advocacia brasileiro.
Recebe as instruções gerais do fluxo, o pedido deste passo, os documentos e o resultado dos passos anteriores.
Regras:
- Use só o que está nos documentos, nos dados dos processos e nos resultados anteriores. Não invente fatos, datas, valores nem decisões.
- Ao usar um PDF, aponte o documento e a página assim: (Doc. 2, p. 5). Ao usar a tabela ou outro processo, cite o processo pelo número.
- Onde faltar informação ou prova, escreva [conferir] em vez de supor.
- Escreva em português, em texto simples: títulos em linha própria, parágrafos curtos e listas com hífen ou números. Sem tabelas em Markdown.
- Responda só com o resultado pedido, sem comentar o que vai fazer.`;

const INSTRUCOES_BIBLIOTECA = `${INSTRUCOES_PASSO}
- Neste passo, a base são os itens da Biblioteca do escritório (modelos, jurisprudência, súmulas). Ao usar um item, cite o título ou a referência dele.`;

const MAX_LINHAS_POR_VEZ = 3;

type ValorFluxo = Omit<FluxoIa, "id" | "criadoEm" | "atualizadoEm">;
type ValorExecucao = Omit<ExecucaoFluxo, "id" | "criadoEm" | "atualizadoEm">;

const paraFluxo = (r: Registro<ValorFluxo>): FluxoIa => ({ ...r.valor, id: r.id, criadoEm: r.criadoEm, atualizadoEm: r.atualizadoEm });
const paraExecucao = (r: Registro<ValorExecucao>): ExecucaoFluxo => ({ ...r.valor, id: r.id, criadoEm: r.criadoEm, atualizadoEm: r.atualizadoEm });

const naoEncontrado = () => new AppError("nao_encontrado", "Fluxo não encontrado.");
const execucaoNaoEncontrada = () => new AppError("nao_encontrado", "Execução não encontrada.");

function exigirValido(corpo: unknown): DadosFluxo {
  const r = validarFluxo(corpo);
  if ("erro" in r) throw new AppError("dados_invalidos", r.erro, { campo: r.campo });
  return r.dados;
}

/** Corta o texto que segue para o próximo passo, para o pedido à IA não estourar. */
const cortar = (t: string, max = LIMITES_FLUXO_IA.texto) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);

/** Fluxos de IA do escritório e as execuções de cada pessoa. */
export class FluxosIaService {
  private readonly repo: RegistrosRepository;
  private readonly processos: ProcessoRepository;
  private readonly contexto: ContextoProcesso;
  private readonly padroes: PadroesService;
  private readonly revisoes: RevisoesService;
  private readonly pesquisa: PesquisaService;
  private readonly citacoes: CitacoesService;
  private readonly biblioteca: BibliotecaService;
  private readonly ia?: ServicoIa;
  private readonly clock: Clock;
  private readonly limitar: (usuarioId: string) => void;
  private readonly exclusivo = new Exclusivo();

  constructor(d: {
    repo: RegistrosRepository;
    processos: ProcessoRepository;
    contexto: ContextoProcesso;
    padroes: PadroesService;
    revisoes: RevisoesService;
    pesquisa: PesquisaService;
    citacoes: CitacoesService;
    biblioteca: BibliotecaService;
    ia?: ServicoIa;
    clock: Clock;
    limitar?: (usuarioId: string) => void;
  }) {
    this.repo = d.repo;
    this.processos = d.processos;
    this.contexto = d.contexto;
    this.padroes = d.padroes;
    this.revisoes = d.revisoes;
    this.pesquisa = d.pesquisa;
    this.citacoes = d.citacoes;
    this.biblioteca = d.biblioteca;
    this.ia = d.ia;
    this.clock = d.clock;
    this.limitar = d.limitar ?? (() => undefined);
  }

  get disponivel() {
    return !!this.ia;
  }

  // ---- Fluxos ----

  /** Rascunho de outra pessoa não existe para quem pergunta. */
  private async exigir(usuarioId: string, id: string): Promise<Registro<ValorFluxo>> {
    const r = idValido(id) ? await this.repo.obter<ValorFluxo>(usuarioId, "fluxo_ia", id) : null;
    if (!r || (!r.valor.publicado && r.valor.autorId !== usuarioId)) throw naoEncontrado();
    return r;
  }

  async listar(usuarioId: string): Promise<FluxoIa[]> {
    return (await this.repo.listar<ValorFluxo>(usuarioId, "fluxo_ia"))
      .filter((r) => r.valor.publicado || r.valor.autorId === usuarioId)
      .map(paraFluxo)
      .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
  }

  async obter(usuarioId: string, id: string): Promise<FluxoIa> {
    return paraFluxo(await this.exigir(usuarioId, id));
  }

  async criar(autor: { id: string; nome: string }, corpo: unknown): Promise<FluxoIa> {
    const dados = exigirValido(corpo);
    if ((await this.repo.listar(autor.id, "fluxo_ia")).length >= LIMITES_FLUXO_IA.porEscritorio) {
      throw new AppError("dados_invalidos", `O escritório chegou ao limite de ${LIMITES_FLUXO_IA.porEscritorio} fluxos. Exclua os que não usa mais.`);
    }
    const agora = this.clock.agora().toISOString();
    const r: Registro<ValorFluxo> = { id: novoId(), tipo: "fluxo_ia", valor: { ...dados, autorId: autor.id, autorNome: nomeDoAutor(autor.nome) }, criadoEm: agora, atualizadoEm: agora };
    await this.repo.gravar(autor.id, r);
    return paraFluxo(r);
  }

  async atualizar(usuarioId: string, id: string, corpo: unknown): Promise<FluxoIa> {
    await this.exigir(usuarioId, id);
    const dados = exigirValido(corpo);
    const salvo = await this.repo.alterar<ValorFluxo>(usuarioId, "fluxo_ia", id, (r) => ({ ...r.valor, ...dados, instrucoes: dados.instrucoes }), this.clock.agora().toISOString());
    if (!salvo) throw naoEncontrado();
    return paraFluxo(salvo);
  }

  async excluir(usuarioId: string, id: string) {
    await this.exigir(usuarioId, id);
    await this.repo.excluir(usuarioId, "fluxo_ia", id);
  }

  // ---- Execuções ----

  private async exigirExecucao(usuarioId: string, id: string): Promise<Registro<ValorExecucao>> {
    const r = idValido(id) ? await this.repo.obter<ValorExecucao>(usuarioId, "execucao_fluxo", id) : null;
    // Execução é pessoal (dono_id): no Postgres o RLS já esconde; sem banco, a conferência fica aqui.
    if (!r || r.donoId !== usuarioId) throw execucaoNaoEncontrada();
    return r;
  }

  async listarExecucoes(usuarioId: string): Promise<ExecucaoFluxo[]> {
    return (await this.repo.listar<ValorExecucao>(usuarioId, "execucao_fluxo"))
      .filter((r) => r.donoId === usuarioId)
      .map(paraExecucao)
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }

  async obterExecucao(usuarioId: string, id: string): Promise<ExecucaoFluxo> {
    return paraExecucao(await this.exigirExecucao(usuarioId, id));
  }

  async excluirExecucao(usuarioId: string, id: string) {
    await this.exigirExecucao(usuarioId, id);
    await this.repo.excluir(usuarioId, "execucao_fluxo", id);
  }

  /** Prepara a execução com os processos escolhidos. Nada roda até a tela pedir cada avanço. */
  async iniciar(autor: { id: string; nome: string }, fluxoId: string, corpo: unknown): Promise<ExecucaoFluxo> {
    if (!this.ia) throw semIa("O fluxo");
    const fluxo = paraFluxo(await this.exigir(autor.id, fluxoId));
    const c = (corpo && typeof corpo === "object" ? corpo : {}) as { processos?: unknown; contexto?: unknown };
    const pedidos = Array.isArray(c.processos) ? [...new Set(c.processos.filter(idValido))] : [];
    if (pedidos.length > LIMITES_FLUXO_IA.processos) throw new AppError("dados_invalidos", `Escolha até ${LIMITES_FLUXO_IA.processos} processos.`, { campo: "processos" });
    const todos = new Map((await this.processos.listar(autor.id)).map((p) => [p.id, p]));
    const processos = pedidos.flatMap((id) => {
      const p = todos.get(id);
      return p ? [{ id, rotulo: p.numero ? `${formatProcesso(p.numero)} · ${referencia(p)}` : referencia(p) }] : [];
    });
    if (pedidos.length && !processos.length) throw new AppError("dados_invalidos", "Nenhum dos processos escolhidos foi encontrado.", { campo: "processos" });
    if (exigeProcessos(fluxo.passos) && !processos.length) throw new AppError("dados_invalidos", "Este fluxo tem revisão em tabela: escolha ao menos um processo.", { campo: "processos" });

    // Guarda as mais recentes: as antigas além do limite vão embora.
    const anteriores = await this.listarExecucoes(autor.id);
    for (const v of anteriores.slice(LIMITES_FLUXO_IA.execucoesPorConta - 1)) await this.repo.excluir(autor.id, "execucao_fluxo", v.id);

    const agora = this.clock.agora().toISOString();
    const contexto = textoLimpo(c.contexto, LIMITES_FLUXO_IA.contexto);
    const r: Registro<ValorExecucao> = {
      id: novoId(),
      tipo: "execucao_fluxo",
      donoId: autor.id,
      valor: {
        fluxoId: fluxo.id,
        fluxoTitulo: fluxo.titulo,
        ...(fluxo.instrucoes ? { instrucoes: fluxo.instrucoes } : {}),
        passos: fluxo.passos,
        processos,
        ...(contexto ? { contexto } : {}),
        resultados: fluxo.passos.map((p) => ({ passoId: p.id, estado: "pendente" })),
        estado: "rodando",
        autorId: autor.id,
        autorNome: nomeDoAutor(autor.nome),
      },
      criadoEm: agora,
      atualizadoEm: agora,
    };
    await this.repo.gravar(autor.id, r);
    return paraExecucao(r);
  }

  /**
   * Faz a próxima parte do trabalho e grava: um passo inteiro, ou alguns processos da tabela. A tela
   * chama de novo enquanto a execução estiver rodando, e mostra o andamento a cada volta.
   * `pular` deixa o passo da vez de lado (útil depois de um erro).
   */
  async avancar(autor: { id: string; nome: string }, id: string, corpo?: unknown): Promise<ExecucaoFluxo> {
    const ia = this.ia;
    if (!ia) throw semIa("O fluxo");
    const pular = (corpo as { pular?: unknown } | null)?.pular === true;
    return this.exclusivo.executar(id, "Este fluxo já está rodando em outra aba.", async () => {
      const exec = paraExecucao(await this.exigirExecucao(autor.id, id));
      const atual = passoAtual(exec);
      let resultado: ResultadoPasso | undefined;
      if (atual) {
        const passo = exec.passos.find((p) => p.id === atual.passoId)!;
        if (pular) resultado = { passoId: passo.id, estado: "pulado", resumo: "Pulado.", concluidoEm: this.clock.agora().toISOString() };
        else {
          try {
            resultado = await this.rodar(autor, exec, passo, atual, ia);
          } catch (e) {
            resultado = { ...atual, estado: "erro", erro: e instanceof AppError ? e.message : falhaDaIa("fluxos", e).message };
          }
        }
      }
      const agora = this.clock.agora().toISOString();
      const salvo = await this.repo.alterar<ValorExecucao>(
        autor.id,
        "execucao_fluxo",
        id,
        (r) => {
          const resultados = resultado ? r.valor.resultados.map((x) => (x.passoId === resultado.passoId ? resultado : x)) : r.valor.resultados;
          const fim = !passoAtual({ resultados });
          return {
            ...r.valor,
            resultados,
            modelo: ia.modelo,
            estado: fim ? "concluida" : "rodando",
            ...(fim ? { relatorio: relatorioDe({ ...r.valor, resultados }) } : {}),
          };
        },
        agora,
      );
      if (!salvo) throw execucaoNaoEncontrada();
      return paraExecucao(salvo);
    });
  }

  private async rodar(autor: { id: string; nome: string }, exec: ExecucaoFluxo, passo: PassoFluxo, atual: ResultadoPasso, ia: ServicoIa): Promise<ResultadoPasso> {
    const agora = () => this.clock.agora().toISOString();
    const feito = (r: Omit<ResultadoPasso, "passoId" | "estado">): ResultadoPasso => ({ passoId: passo.id, estado: "feito", ...r, concluidoEm: agora() });
    const anterior = ultimoTexto(exec, passo.id);

    switch (passo.ferramenta) {
      case "revisao_tabela": {
        if (!atual.revisaoId) {
          const data = new Date(exec.criadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
          const revisao = await this.revisoes.criar(autor, { titulo: `${exec.fluxoTitulo} · ${data}`, perguntas: passo.perguntas, processos: exec.processos.map((p) => p.id) });
          return { passoId: passo.id, estado: "rodando", revisaoId: revisao.id, feitos: 0, total: revisao.linhas.length, resumo: "Tabela criada. Lendo os processos…" };
        }
        const revisao = await this.revisoes.obter(autor.id, atual.revisaoId).catch(() => {
          throw new AppError("nao_encontrado", "A tabela deste passo foi excluída. Pule o passo ou rode o fluxo de novo.");
        });
        const faltam = revisao.linhas.filter((l) => !l.executadaEm);
        await Promise.all(faltam.slice(0, MAX_LINHAS_POR_VEZ).map((l) => this.revisoes.executar(autor, revisao.id, l.processoId)));
        const depois = await this.revisoes.obter(autor.id, revisao.id);
        const prontas = depois.linhas.filter((l) => l.executadaEm).length;
        if (prontas < depois.linhas.length) {
          return { passoId: passo.id, estado: "rodando", revisaoId: revisao.id, feitos: prontas, total: depois.linhas.length, resumo: `Lendo os processos: ${prontas} de ${depois.linhas.length}.` };
        }
        const comErro = depois.linhas.filter((l) => l.erro).length;
        const semResposta = depois.linhas.reduce((n, l) => n + Object.values(l.celulas).filter((c) => c.estado === "sem_resposta").length, 0);
        const tabela = depois.linhas
          .map((l) => `## ${l.rotulo}\n${depois.perguntas.map((p) => { const c = l.celulas[p.id]; return `- ${p.texto}: ${c?.resposta || "(sem resposta)"}${c?.fonte ? ` [${c.fonte.documentoNome}, p. ${c.fonte.pagina}]` : ""}`; }).join("\n")}`)
          .join("\n\n");
        return feito({
          revisaoId: revisao.id,
          feitos: prontas,
          total: depois.linhas.length,
          resumo: `${depois.linhas.length} processo(s) × ${depois.perguntas.length} pergunta(s).${semResposta ? ` ${semResposta} resposta(s) não constam nos PDFs.` : ""}${comErro ? ` ${comErro} processo(s) com erro: abra a tabela para rodar de novo.` : ""}`,
          texto: cortar(`Tabela: ${depois.titulo}\n\n${tabela}`),
        });
      }

      case "prompt":
      case "biblioteca": {
        const blocos: BlocoIa[] = [];
        if (passo.ferramenta === "biblioteca") {
          const itens = await this.biblioteca.paraIa(autor.id, passo.bibliotecaIds ?? []);
          if (!itens.length) throw new AppError("dados_invalidos", "Os itens da Biblioteca deste passo não existem mais. Edite o fluxo e escolha outros.");
          for (const i of itens) {
            const titulo = `Biblioteca: ${i.item.referencia ? `${i.item.referencia} · ` : ""}${i.item.titulo}`;
            if (i.pdf) blocos.push({ tipo: "pdf", titulo, bytes: i.pdf });
            if (i.texto) blocos.push({ tipo: "documento", titulo, texto: i.texto });
          }
        }
        // Um processo: a IA lê os PDFs dele. Vários: só os dados (os PDFs de cada um vão pela tabela).
        if (exec.processos.length === 1 && passo.ferramenta === "prompt") {
          blocos.push(...(await this.contexto.carregar(autor.id, exec.processos[0].id)).blocos);
        } else if (exec.processos.length) {
          const textos: string[] = [];
          for (const p of exec.processos) {
            const proc = await this.processos.porId(autor.id, p.id);
            if (proc) textos.push(`## ${p.rotulo}\n${descreverProcesso(proc)}`);
          }
          if (textos.length) blocos.push({ tipo: "documento", titulo: "Processos escolhidos", texto: textos.join("\n\n") });
        }
        const anteriores = exec.resultados
          .filter((r) => r.passoId !== passo.id && r.estado === "feito" && r.texto)
          .map((r) => {
            const p = exec.passos.find((x) => x.id === r.passoId);
            return `## Passo ${exec.passos.indexOf(p!) + 1}: ${p ? FERRAMENTA_FLUXO_LABEL[p.ferramenta] : ""}\n${r.texto}`;
          });
        if (anteriores.length) blocos.push({ tipo: "documento", titulo: "Resultado dos passos anteriores", texto: cortar(anteriores.join("\n\n")) });
        const padroes = await this.padroes.instrucoes(autor.id, "fluxos");
        blocos.push({
          tipo: "texto",
          texto: [
            exec.instrucoes && `Instruções gerais do fluxo "${exec.fluxoTitulo}":\n${exec.instrucoes}`,
            exec.contexto && `Contexto dado por quem rodou o fluxo:\n${exec.contexto}`,
            blocoDosPadroes(padroes),
            `Pedido deste passo:\n${passo.instrucao}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        });
        this.limitar(autor.id);
        let texto: string;
        try {
          texto = (await ia.perguntar({ sistema: passo.ferramenta === "biblioteca" ? INSTRUCOES_BIBLIOTECA : INSTRUCOES_PASSO, blocos, esforco: "high" })).texto.trim();
        } catch (e) {
          throw falhaDaIa("fluxos", e);
        }
        if (!texto) throw new AppError("indisponivel", "A IA não devolveu texto. Tente de novo.");
        const palavras = texto.split(/\s+/).length;
        return feito({ resumo: `Texto pronto (${palavras.toLocaleString("pt-BR")} palavras).`, texto: cortar(texto) });
      }

      case "pesquisar": {
        const contexto = [
          exec.processos.length === 1 && descreverProcesso(await this.contexto.processo(autor.id, exec.processos[0].id)),
          exec.contexto,
          anterior && `Resultado do passo anterior:\n${anterior.slice(0, 6000)}`,
        ]
          .filter(Boolean)
          .join("\n\n");
        const r = await this.pesquisa.pesquisar(autor.id, { pergunta: passo.instrucao }, contexto || undefined);
        const fontes = r.fontes.map((f) => `- ${f.referencia}${f.tribunal ? ` (${f.tribunal})` : ""}: ${f.resumo} ${f.url}`).join("\n");
        return feito({
          resumo: `${r.fontes.length} fonte(s) oficial(is) encontrada(s).`,
          texto: cortar(`${r.resposta}${fontes ? `\n\nFontes:\n${fontes}` : ""}`),
          fontes: r.fontes.map((f) => ({ titulo: f.referencia, url: f.url })),
        });
      }

      case "verificar_citacoes": {
        if (!anterior) throw new AppError("dados_invalidos", "Não há texto anterior para verificar.");
        const v = await this.citacoes.verificar(autor, { texto: anterior.slice(0, 60_000) });
        const pend = contarPendencias(v);
        const lista = v.citacoes.map((c) => `- ${c.texto}: ${SITUACAO_CITACAO_LABEL[c.situacao]}${c.comentario ? `. ${c.comentario}` : ""}${c.fonte ? ` ${c.fonte.url}` : ""}`).join("\n");
        return feito({
          resumo: v.citacoes.length ? `${v.citacoes.length} citação(ões) conferida(s); ${pend ? `${pend} pedem atenção` : "nenhuma pendência"}.` : "Nenhuma citação encontrada no texto.",
          ...(lista ? { texto: `Verificação das citações:\n${lista}` } : {}),
          fontes: v.citacoes.flatMap((c) => (c.fonte ? [c.fonte] : [])),
        });
      }

      case "traduzir": {
        if (!anterior) throw new AppError("dados_invalidos", "Não há texto anterior para traduzir.");
        const idioma = IDIOMA_LABEL[passo.idioma ?? "en"] ? (passo.idioma ?? "en") : "en";
        this.limitar(autor.id);
        let texto: string;
        try {
          texto = (await ia.perguntar({ sistema: INSTRUCOES_TRADUCAO, esforco: "medium", blocos: [{ tipo: "documento", titulo: "Texto", texto: anterior }, { tipo: "texto", texto: `Traduza para o ${IDIOMA_LABEL[idioma]}.` }] })).texto.trim();
        } catch (e) {
          throw falhaDaIa("fluxos", e);
        }
        return feito({ resumo: `Traduzido para o ${IDIOMA_LABEL[idioma]}.`, texto: cortar(texto) });
      }
    }
  }
}

/** Relatório final: o último texto escrito; se as citações dele pedem atenção, a lista vai junto. */
export function relatorioDe(e: Pick<ExecucaoFluxo, "passos" | "resultados">): string | undefined {
  const texto = ultimoTexto(e);
  if (!texto) return undefined;
  const ultimoEscrito = [...e.resultados].reverse().find((r) => r.texto === texto);
  const depois = ultimoEscrito ? e.resultados.slice(e.resultados.indexOf(ultimoEscrito) + 1) : [];
  const verificacao = depois.find((r) => e.passos.find((p) => p.id === r.passoId)?.ferramenta === "verificar_citacoes" && r.estado === "feito" && r.texto && !/nenhuma pendência/.test(r.resumo ?? ""));
  return verificacao ? `${texto}\n\n${verificacao.texto}` : texto;
}
