import Link from "next/link";
import type { Metadata } from "next";
import type { PaginaPublica, Secao } from "@/lib/publico/conteudo";
import { trechos } from "@/lib/publico/markdown";

export const IMAGEM_DE_COMPARTILHAMENTO = { url: "/opengraph-image", width: 1200, height: 630, alt: "Clepsa: monitoramento de intimações e prazos" };

/** Texto com links [texto](/caminho) virando <Link>. */
export function TextoComLinks({ texto }: { texto: string }) {
  return (
    <>
      {trechos(texto).map((t, i) =>
        t.tipo === "texto" ? (
          <span key={i}>{t.texto}</span>
        ) : (
          <Link key={i} href={t.href} className="font-medium text-brand-300 underline decoration-brand-300/40 underline-offset-2 hover:decoration-brand-300">
            {t.texto}
          </Link>
        ),
      )}
    </>
  );
}

export function SecaoSite({ secao }: { secao: Secao }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-white">{secao.titulo}</h2>
      {secao.paragrafos?.map((p, i) => (
        <p key={i} className="leading-relaxed text-slate-300">
          <TextoComLinks texto={p} />
        </p>
      ))}
      {secao.itens && (
        <ul className="list-disc space-y-1.5 pl-5 leading-relaxed text-slate-300 marker:text-brand-400">
          {secao.itens.map((item, i) => (
            <li key={i}>
              <TextoComLinks texto={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Página de texto do site público (sobre, contato, privacidade, documentação). */
export function PaginaSite({ pagina }: { pagina: PaginaPublica }) {
  return (
    <article className="space-y-10">
      <header className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{pagina.h1}</h1>
        {pagina.introducao.map((p, i) => (
          <p key={i} className="text-[17px] leading-relaxed text-slate-300">
            <TextoComLinks texto={p} />
          </p>
        ))}
      </header>
      {pagina.secoes.map((s) => (
        <SecaoSite key={s.titulo} secao={s} />
      ))}
    </article>
  );
}

export function metadadosDaPagina(pagina: PaginaPublica): Metadata {
  return {
    title: pagina.caminho === "/" ? { absolute: pagina.titulo } : pagina.titulo,
    description: pagina.descricao,
    alternates: { canonical: pagina.caminho },
    openGraph: { type: "website", siteName: "Clepsa", locale: "pt_BR", url: pagina.caminho, title: pagina.titulo, description: pagina.descricao, images: [IMAGEM_DE_COMPARTILHAMENTO] },
    twitter: { card: "summary_large_image", images: [IMAGEM_DE_COMPARTILHAMENTO.url] },
  };
}
