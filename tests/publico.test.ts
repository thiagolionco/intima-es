import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { entradasDoSitemap } from "../lib/publico/arquivos.ts";
import { PAGINAS_PUBLICAS, type PaginaPublica } from "../lib/publico/conteudo.ts";
import { dadosEstruturados, jsonParaScript } from "../lib/publico/jsonld.ts";
import { naoEncontradoEmMarkdown, paginaEmMarkdown, trechos } from "../lib/publico/markdown.ts";
import { prefereMarkdown } from "../lib/publico/negociacao.ts";
import { CAMINHO_INEXISTENTE, CAMINHO_INICIO_PUBLICO, decidirRotaPublica, SEGMENTOS_CONHECIDOS } from "../lib/publico/rotas.ts";
import { URL_DO_SITE } from "../lib/publico/site.ts";

const NAVEGADOR = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";

/** Nada do que é público pode citar rotas internas, segredos ou a área de administração. */
const PROIBIDOS = [/rondas/i, /RONDA_TOKEN/, /VERCEL_BYPASS/i, /bypass/i, /administracao/i, /\/api\//, /supabase\.co/i, /service_role/i];

function textoDaPagina(p: PaginaPublica): string {
  return [p.h1, ...p.introducao, ...p.secoes.flatMap((s) => [s.titulo, ...(s.paragrafos ?? []), ...(s.itens ?? [])])].join(" ");
}

describe("negociação de conteúdo", () => {
  test("navegador continua recebendo HTML", () => {
    assert.equal(prefereMarkdown(NAVEGADOR), false);
    assert.equal(prefereMarkdown("*/*"), false);
    assert.equal(prefereMarkdown(null), false);
    assert.equal(prefereMarkdown(""), false);
  });

  test("agente que pede text/markdown recebe Markdown", () => {
    assert.equal(prefereMarkdown("text/markdown"), true);
    assert.equal(prefereMarkdown("text/markdown, text/html;q=0.9"), true);
    assert.equal(prefereMarkdown("text/markdown;q=0.9, */*;q=0.8"), true);
    assert.equal(prefereMarkdown("TEXT/MARKDOWN"), true);
    assert.equal(prefereMarkdown("text/x-markdown"), true);
  });

  test("respeita a preferência e q=0", () => {
    assert.equal(prefereMarkdown("text/html, text/markdown;q=0.5"), false);
    assert.equal(prefereMarkdown("text/markdown;q=0"), false);
  });
});

describe("decisão do middleware para o site público", () => {
  test("'/' sem login mostra a página inicial pública; com login, o Painel", () => {
    assert.deepEqual(decidirRotaPublica("/", NAVEGADOR, false), { tipo: "reescrever", para: CAMINHO_INICIO_PUBLICO });
    assert.deepEqual(decidirRotaPublica("/", NAVEGADOR, true), { tipo: "seguir" });
  });

  test("Accept: text/markdown devolve Markdown nas páginas públicas, com ou sem login", () => {
    for (const p of PAGINAS_PUBLICAS) {
      for (const sessao of [false, true]) {
        const d = decidirRotaPublica(p.caminho, "text/markdown", sessao);
        assert.equal(d?.tipo, "markdown", p.caminho);
        if (d?.tipo === "markdown") {
          assert.equal(d.status, 200);
          assert.ok(d.corpo.startsWith(`# ${p.h1}`));
        }
      }
    }
    const inicio = decidirRotaPublica(CAMINHO_INICIO_PUBLICO, "text/markdown", false);
    assert.equal(inicio?.tipo, "markdown");
  });

  test("páginas públicas e arquivos para agentes passam sem login", () => {
    for (const c of ["/sobre", "/contato", "/privacidade", "/sobre/", "/sitemap.xml", "/robots.txt", "/opengraph-image"]) {
      assert.deepEqual(decidirRotaPublica(c, NAVEGADOR, false), { tipo: "seguir" }, c);
    }
  });

  test("endereço inexistente responde 404 de verdade", () => {
    assert.deepEqual(decidirRotaPublica("/some-path-that-does-not-exist", NAVEGADOR, false), { tipo: "reescrever", para: CAMINHO_INEXISTENTE, status: 404 });
    assert.deepEqual(decidirRotaPublica("/.well-known/mcp", NAVEGADOR, true), { tipo: "reescrever", para: CAMINHO_INEXISTENTE, status: 404 });
    const md = decidirRotaPublica("/nao-existe/mesmo", "text/markdown", false);
    assert.equal(md?.tipo, "markdown");
    if (md?.tipo === "markdown") {
      assert.equal(md.status, 404);
      assert.match(md.corpo, /\/nao-existe\/mesmo/);
      for (const destino of ["/", "/sitemap.xml"]) assert.ok(md.corpo.includes(`${URL_DO_SITE}${destino}`));
    }
    assert.ok(CAMINHO_INEXISTENTE.split("/")[1].startsWith("_"), "pasta privada do Next, nunca vira página");
  });

  test("documentação para agentes foi retirada: /docs, /llms.txt e /openapi.json dão 404", () => {
    for (const c of ["/docs", "/llms.txt", "/openapi.json"]) assert.deepEqual(decidirRotaPublica(c, NAVEGADOR, false), { tipo: "reescrever", para: CAMINHO_INEXISTENTE, status: 404 }, c);
  });

  test("telas com login e API continuam com as regras de sempre", () => {
    for (const c of ["/processos", "/intimacoes/123", "/entrar", "/api/rondas/saude", "/api/qualquer", "/dev/caixa-de-saida"]) {
      assert.equal(decidirRotaPublica(c, NAVEGADOR, false), null, c);
    }
  });

  test("todo segmento de app/ é conhecido (senão a tela viraria 404)", () => {
    const app = join(import.meta.dirname, "..", "app");
    const segmentos: string[] = [];
    for (const e of readdirSync(app, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith("(")) {
        for (const f of readdirSync(join(app, e.name), { withFileTypes: true })) if (f.isDirectory()) segmentos.push(f.name);
      } else segmentos.push(e.name);
    }
    assert.ok(segmentos.length > 20);
    for (const s of segmentos) assert.ok(SEGMENTOS_CONHECIDOS.has(s), `falta "${s}" em SEGMENTOS_CONHECIDOS`);
  });
});

describe("páginas públicas", () => {
  test("cada página tem H1 e pelo menos 500 caracteres de texto", () => {
    assert.deepEqual(
      PAGINAS_PUBLICAS.map((p) => p.caminho),
      ["/", "/sobre", "/contato", "/privacidade"],
    );
    for (const p of PAGINAS_PUBLICAS) {
      assert.ok(p.h1.length > 5, p.caminho);
      assert.ok(textoDaPagina(p).length >= 500, `${p.caminho}: ${textoDaPagina(p).length} caracteres`);
    }
  });

  test("Markdown com títulos em ordem e links absolutos", () => {
    for (const p of PAGINAS_PUBLICAS) {
      const md = paginaEmMarkdown(p);
      assert.equal(md.match(/^# /gm)?.length, 1);
      assert.ok(!/^### /m.test(md));
      assert.ok(!/\]\(\//.test(md), `${p.caminho}: link relativo no Markdown`);
    }
  });

  test("links do texto viram trechos para o HTML", () => {
    assert.deepEqual(trechos("Leia a [política](/privacidade) agora."), [
      { tipo: "texto", texto: "Leia a " },
      { tipo: "link", texto: "política", href: "/privacidade" },
      { tipo: "texto", texto: " agora." },
    ]);
    assert.deepEqual(trechos("sem links"), [{ tipo: "texto", texto: "sem links" }]);
  });

  test("nada público cita rotas internas ou segredos", () => {
    const publicos = [...PAGINAS_PUBLICAS.map(paginaEmMarkdown), JSON.stringify(dadosEstruturados()), naoEncontradoEmMarkdown("/x")];
    for (const texto of publicos) for (const r of PROIBIDOS) assert.ok(!r.test(texto), `${r} apareceu em: ${texto.slice(0, 60)}`);
  });
});

describe("sitemap e dados estruturados", () => {
  test("sitemap lista as páginas públicas com endereço absoluto e data", () => {
    const entradas = entradasDoSitemap();
    assert.equal(entradas.length, PAGINAS_PUBLICAS.length);
    for (const e of entradas) {
      assert.ok(e.url.startsWith(`${URL_DO_SITE}/`));
      assert.match(e.lastModified, /^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("JSON-LD com Organization, WebSite e SoftwareApplication, sem contato inventado", () => {
    const dados = dadosEstruturados() as { "@context": string; "@graph": Record<string, unknown>[] };
    assert.equal(dados["@context"], "https://schema.org");
    assert.deepEqual(dados["@graph"].map((g) => g["@type"]), ["Organization", "WebSite", "SoftwareApplication"]);
    for (const g of dados["@graph"]) assert.ok(g.name && g.url);
    const org = dados["@graph"][0];
    assert.equal(org.contactPoint, undefined);
    assert.equal(org.address, undefined);
    assert.equal(jsonParaScript({ a: "</script>" }), '{"a":"\\u003c/script>"}');
  });
});
