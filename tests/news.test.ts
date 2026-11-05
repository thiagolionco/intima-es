import { test } from "node:test";
import assert from "node:assert/strict";
import { lerData, lerFeed, textoPuro } from "../lib/news/feeds.ts";
import { EIXOS, FEEDS, linkOficial } from "../lib/news/fontes.ts";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Portal de Noticias</title>
<item><title><![CDATA[Supremo julga &quot;Tema 1.046&quot;]]></title><link>https://noticias.stf.jus.br/postsnoticias/x/</link>
<pubDate>Wed, 04 Nov 2026 17:59:36 +0000</pubDate><description><![CDATA[<p>O Plenário &amp; a tese.</p>]]></description></item>
<item><title>Sem link</title></item>
<item><title>Senado</title><link>https://www12.senado.leg.br/noticias/a</link><pubDate>2026-11-05T00:06:37Z</pubDate></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>STJ - Informativos</title>
<entry><title>Informativo n. 905 - 13 de outubro de 2026.</title><link rel="alternate" href="https://processo.stj.jus.br/jurisprudencia/externo/informativo/?aplicacao=informativo&amp;acao=pesquisar&amp;livre=0905"/>
<updated>2026-10-13T00:00:00-03:00</updated><summary>Corte Especial: superação de entendimento.</summary></entry></feed>`;

test("lê RSS 2.0: CDATA, entidades, HTML do resumo e descarta item sem link", () => {
  const itens = lerFeed(RSS);
  assert.equal(itens.length, 2);
  assert.equal(itens[0].titulo, 'Supremo julga "Tema 1.046"');
  assert.equal(itens[0].data, "2026-11-04T17:59:36.000Z");
  assert.equal(itens[0].resumo, "O Plenário & a tese.");
  assert.equal(itens[1].data, "2026-11-05T00:06:37.000Z");
});

test("lê Atom do STJ com link alternate e data com fuso", () => {
  const [i] = lerFeed(ATOM);
  assert.match(i.link, /^https:\/\/processo\.stj\.jus\.br\/.*&acao=pesquisar/);
  assert.equal(i.data, "2026-10-13T03:00:00.000Z");
  assert.equal(i.resumo, "Corte Especial: superação de entendimento.");
});

test("datas: RFC 822, ISO e o formato em português do STJ (horário de Brasília)", () => {
  assert.equal(lerData("Qui, nov 5 2026 06:00:00"), "2026-11-05T09:00:00.000Z");
  assert.equal(lerData("Wed, 04 Nov 2026 23:26:00 GMT"), "2026-11-04T23:26:00.000Z");
  assert.equal(lerData("2026-08-14"), "2026-08-14T00:00:00.000Z");
  assert.equal(lerData("ontem"), undefined);
});

test("texto puro tira HTML escapado", () => {
  assert.equal(textoPuro("&lt;b&gt;Tese&lt;/b&gt; fixada"), "Tese fixada");
});

test("só domínios oficiais passam; javascript: e agregadores são barrados", () => {
  assert.ok(linkOficial("https://scon.stj.jus.br/SCON/jt/"));
  assert.ok(linkOficial("https://www.camara.leg.br/noticias/1"));
  assert.ok(!linkOficial("https://www.jusbrasil.com.br/x"));
  assert.ok(!linkOficial("https://stj.jus.br.exemplo.com/x"));
  assert.ok(!linkOficial("javascript:alert(1)"));
  assert.equal(lerFeed(RSS.replace("https://noticias.stf.jus.br/postsnoticias/x/", "javascript:alert(1)")).length, 1);
});

test("feeds e links do guia são todos de domínio oficial e https", () => {
  const ids = new Set<string>();
  for (const f of FEEDS) {
    assert.ok(!ids.has(f.id), `id repetido: ${f.id}`);
    ids.add(f.id);
    assert.ok(f.url.startsWith("https://") && linkOficial(f.url), f.url);
    assert.ok(linkOficial(f.pagina), f.pagina);
  }
  for (const e of EIXOS) for (const f of e.fontes) assert.ok(f.url.startsWith("https://") && linkOficial(f.url), f.url);
});
