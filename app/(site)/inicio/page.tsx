import { Instrument_Serif } from "next/font/google";
import Link from "next/link";
import { metadadosDaPagina, SecaoSite, TextoComLinks } from "@/components/site/pagina-site";
import { paginaPublicaObrigatoria } from "@/lib/publico/conteudo";
import { dadosEstruturados, jsonParaScript } from "@/lib/publico/jsonld";

const serifa = Instrument_Serif({ subsets: ["latin"], weight: ["400"], style: ["normal", "italic"], display: "swap" });

const pagina = paginaPublicaObrigatoria("/");

export const metadata = metadadosDaPagina(pagina);

/**
 * Página inicial pública. O middleware a serve em "/" para quem ainda não entrou; com login,
 * "/" continua sendo o Painel.
 */
export default function InicioPublicoPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonParaScript(dadosEstruturados()) }} />
      <article className="space-y-12">
        <header className="space-y-6">
          <p className={`${serifa.className} text-[40px] leading-[1.05] tracking-tight text-white sm:text-[52px]`}>
            Nenhuma intimação <em className="text-brand-300">passa despercebida.</em>
          </p>
          <h1 className="text-xl font-semibold leading-snug text-white sm:text-2xl">{pagina.h1}</h1>
          {pagina.introducao.map((p, i) => (
            <p key={i} className="text-[17px] leading-relaxed text-slate-300">
              <TextoComLinks texto={p} />
            </p>
          ))}
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/criar-conta" className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-500">
              Criar conta
            </Link>
            <Link href="/entrar" className="rounded-lg px-5 py-2.5 font-medium text-slate-100 ring-1 ring-inset ring-white/20 hover:bg-white/5">
              Entrar
            </Link>
          </div>
        </header>
        {pagina.secoes.map((s) => (
          <SecaoSite key={s.titulo} secao={s} />
        ))}
      </article>
    </>
  );
}
