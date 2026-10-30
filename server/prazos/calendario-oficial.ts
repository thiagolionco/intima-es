import { limparDiasOficiais, type CalendarioOficial } from "../../lib/prazos/calendario-oficial.ts";
import { dominioTribunal, fontesDoTribunal, GRUPOS_TRIBUNAIS, siglaTribunal } from "../../lib/prazos/tribunais.ts";
import { AppError } from "../core/errors.ts";
import type { Clock } from "../core/clock.ts";
import { falhaDaIa, semIa } from "../ia/contexto-processo.ts";
import { perguntarJson, type BlocoIa, type ServicoIa } from "../ia/ia.ts";

const INSTRUCOES = `Você lê o calendário oficial de um tribunal brasileiro e lista os dias sem expediente forense ou com prazos suspensos.
Regras:
- Liste só o que o documento diz, com as datas exatas. Não invente nem complete com feriados que você conhece de memória.
- Inclua feriados (nacionais, estaduais, municipais), transferências de feriado (use a data para onde foi transferido), pontos facultativos com suspensão de expediente, suspensões de prazo por portaria e o recesso.
- Ponto facultativo sem suspensão de expediente não entra. Se o documento não deixa claro, deixe de fora.
- Um período (ex.: 20 a 31/12) vira uma linha com início e fim.
- abrangencia: "nacional" (todo o país), "estadual" (todo o tribunal ou todo o estado), "municipal" (um município ou comarca: ponha o nome em local), "orgao" (uma vara, fórum ou unidade: ponha o nome em local).
- base: a portaria, decreto, resolução ou lei citada, se houver; senão vazio.
- Só dias do ano pedido.`;

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["encontrado", "dias"],
  properties: {
    encontrado: { type: "boolean", description: "false se o documento não traz o calendário do ano pedido." },
    dias: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["inicio", "fim", "descricao", "abrangencia", "local", "base"],
        properties: {
          inicio: { type: "string", description: "AAAA-MM-DD" },
          fim: { type: "string", description: "AAAA-MM-DD; igual ao início se for um dia só." },
          descricao: { type: "string" },
          abrangencia: { type: "string", enum: ["nacional", "estadual", "municipal", "orgao"] },
          local: { type: "string" },
          base: { type: "string" },
        },
      },
    },
  },
};

/** Tamanho máximo do que se baixa e do texto que vai para a IA. */
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_TEXTO = 150_000;

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ordm: "º", ordf: "ª" };

/** Texto de uma página HTML, com as linhas das tabelas preservadas ("célula | célula"). */
export function htmlParaTexto(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<(br|\/tr|\/p|\/div|\/li|\/h\d)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTIDADES[n.toLowerCase()] ?? m)
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/[ |]*\n[\s|]*/g, "\n")
    .trim();
}

export type Baixar = (url: string) => Promise<{ tipo: "pdf"; bytes: Uint8Array } | { tipo: "texto"; texto: string } | null>;

/** Baixa a página ou o arquivo do tribunal pelo servidor (que fica no Brasil). */
export const baixarDoTribunal: Baixar = async (url) => {
  try {
    const r = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; Clepsa/1.0; +https://clepsa.vercel.app)", accept: "text/html,application/pdf;q=0.9,*/*;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return null;
    const pdf = (r.headers.get("content-type") ?? "").includes("pdf") || new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
    if (pdf) return { tipo: "pdf", bytes };
    const texto = htmlParaTexto(new TextDecoder().decode(bytes)).slice(0, MAX_TEXTO);
    return texto.length > 200 ? { tipo: "texto", texto } : null;
  } catch {
    return null;
  }
};

/**
 * Lê o calendário publicado pelo tribunal e devolve os dias sem expediente, para o advogado ver
 * dentro do Clepsa. Primeiro lê as fontes conhecidas; se nenhuma abrir, pesquisa no site do tribunal.
 */
export class CalendarioOficialService {
  private readonly ia?: ServicoIa;
  private readonly baixar: Baixar;
  private readonly clock: Clock;
  private readonly limitar: (usuarioId: string) => void;

  constructor(d: { ia?: ServicoIa; baixar?: Baixar; clock: Clock; limitar?: (usuarioId: string) => void }) {
    this.ia = d.ia;
    this.baixar = d.baixar ?? baixarDoTribunal;
    this.clock = d.clock;
    this.limitar = d.limitar ?? (() => undefined);
  }

  get disponivel() {
    return !!this.ia;
  }

  /** Confere o pedido antes de qualquer leitura (a rota usa isto para montar a chave do cache). */
  validar(tribunalBruto: unknown, anoBruto: unknown): { tribunal: string; ano: number } {
    const tribunal = siglaTribunal(typeof tribunalBruto === "string" ? tribunalBruto : "");
    if (!GRUPOS_TRIBUNAIS.some((g) => g.siglas.includes(tribunal))) throw new AppError("dados_invalidos", "Escolha um tribunal da lista.", { campo: "tribunal" });
    const ano = Number(anoBruto);
    const atual = this.clock.agora().getUTCFullYear();
    if (!Number.isInteger(ano) || ano < atual - 1 || ano > atual + 1) throw new AppError("dados_invalidos", "Escolha um ano entre o anterior e o próximo.", { campo: "ano" });
    return { tribunal, ano };
  }

  async ler(usuarioId: string, tribunalBruto: unknown, anoBruto: unknown): Promise<CalendarioOficial> {
    const { tribunal, ano } = this.validar(tribunalBruto, anoBruto);
    const ia = this.ia;
    if (!ia) throw semIa("A leitura do calendário");
    this.limitar(usuarioId);

    const lidas: { url: string; bloco: BlocoIa }[] = [];
    for (const url of fontesDoTribunal(tribunal)) {
      const doc = await this.baixar(url);
      if (doc?.tipo === "pdf") lidas.push({ url, bloco: { tipo: "pdf", titulo: url, bytes: doc.bytes } });
      else if (doc) lidas.push({ url, bloco: { tipo: "documento", titulo: url, texto: doc.texto } });
    }
    const pedido = `Tribunal: ${tribunal}. Ano: ${ano}. Liste os dias sem expediente ou com prazos suspensos em ${ano}.`;

    try {
      if (lidas.length) {
        const { dados } = await perguntarJson<{ encontrado: boolean; dias: unknown[] }>(ia, {
          sistema: INSTRUCOES,
          esquema: ESQUEMA,
          esforco: "medium",
          blocos: [...lidas.map((l) => l.bloco), { tipo: "texto", texto: pedido }],
        });
        const dias = dados.encontrado ? limparDiasOficiais(dados.dias, ano) : [];
        if (dias.length) return { tribunal, ano, dias, fontes: lidas.map((l) => l.url), lidoEm: this.clock.agora().toISOString() };
      }
      // Nenhuma fonte abriu ou nenhuma trazia o ano: procura no site do próprio tribunal.
      const dominio = dominioTribunal(tribunal);
      if (dominio) {
        const { dados, fontesWeb } = await perguntarJson<{ encontrado: boolean; dias: unknown[] }>(ia, {
          sistema: `${INSTRUCOES}\n- Procure no site do tribunal o calendário, a portaria ou o decreto de feriados de ${ano} e leia as páginas que abrir.`,
          esquema: ESQUEMA,
          esforco: "medium",
          pesquisaWeb: { maxUsos: 6, dominios: [dominio] },
          blocos: [{ tipo: "texto", texto: pedido }],
        });
        const dias = dados.encontrado ? limparDiasOficiais(dados.dias, ano) : [];
        if (dias.length) return { tribunal, ano, dias, fontes: fontesWeb.map((f) => f.url).slice(0, 5), lidoEm: this.clock.agora().toISOString() };
      }
    } catch (e) {
      throw falhaDaIa("calendario-oficial", e, `Não consegui ler o calendário do ${tribunal} agora. Tente de novo em alguns minutos.`);
    }
    throw new AppError("nao_encontrado", `Não encontrei o calendário de ${ano} do ${tribunal} no site do tribunal. Use o link do calendário oficial e cadastre os dias ao lado.`);
  }
}
