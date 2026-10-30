import type { PaginaPublica } from "./conteudo.ts";
import { NOME, urlAbsoluta } from "./site.ts";

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

export type Trecho = { tipo: "texto"; texto: string } | { tipo: "link"; texto: string; href: string };

/** Separa um texto com links [texto](/caminho) em trechos, para virar HTML. */
export function trechos(texto: string): Trecho[] {
  const saida: Trecho[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(LINK)) {
    if (m.index > ultimo) saida.push({ tipo: "texto", texto: texto.slice(ultimo, m.index) });
    saida.push({ tipo: "link", texto: m[1], href: m[2] });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) saida.push({ tipo: "texto", texto: texto.slice(ultimo) });
  return saida;
}

/** No Markdown os links internos saem absolutos: o agente pode ler o texto fora do site. */
function linksAbsolutos(texto: string): string {
  return texto.replace(LINK, (_, rotulo: string, href: string) => `[${rotulo}](${href.startsWith("/") ? urlAbsoluta(href) : href})`);
}

export function paginaEmMarkdown(pagina: PaginaPublica): string {
  const linhas = [`# ${pagina.h1}`, "", `> ${pagina.descricao}`, ""];
  for (const p of pagina.introducao) linhas.push(linksAbsolutos(p), "");
  for (const secao of pagina.secoes) {
    linhas.push(`## ${secao.titulo}`, "");
    for (const p of secao.paragrafos ?? []) linhas.push(linksAbsolutos(p), "");
    if (secao.itens?.length) linhas.push(...secao.itens.map((i) => `- ${linksAbsolutos(i)}`), "");
    if (secao.codigo) linhas.push("```sh", secao.codigo, "```", "");
  }
  linhas.push("---", "", `${NOME} · [Início](${urlAbsoluta("/")}) · [Documentação](${urlAbsoluta("/docs")}) · [llms.txt](${urlAbsoluta("/llms.txt")})`, "");
  return linhas.join("\n");
}

export function naoEncontradoEmMarkdown(caminho: string): string {
  return [
    "# 404: página não encontrada",
    "",
    `O endereço \`${caminho.replace(/`/g, "")}\` não existe no ${NOME}.`,
    "",
    "Para descobrir o que está disponível:",
    "",
    `- [Documentação](${urlAbsoluta("/docs")})`,
    `- [Sitemap](${urlAbsoluta("/sitemap.xml")})`,
    `- [llms.txt](${urlAbsoluta("/llms.txt")})`,
    "",
  ].join("\n");
}
