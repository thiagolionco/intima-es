import { Gavel } from "lucide-react";
import { Instrument_Serif, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { OceanoIntimacoes } from "@/components/oceano-intimacoes";

const serifa = Instrument_Serif({ subsets: ["latin"], weight: ["400"], style: ["normal", "italic"], display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: "500", display: "swap" });

/**
 * Layout das telas de acesso: um oceano de intimações ao fundo, a mensagem à esquerda
 * e o formulário num cartão à direita, onde a corrente desemboca.
 */
export default function LayoutAcesso({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#04070f] text-[#eef1ff]">
      <OceanoIntimacoes alvoId="cartao-acesso" />
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(80% 70% at 0% 50%, rgb(4 7 15 / .55), transparent 60%), linear-gradient(180deg, rgb(4 7 15 / .5), transparent 18%, transparent 82%, rgb(4 7 15 / .6))",
        }}
        aria-hidden
      />

      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-4 py-8 sm:px-10 lg:px-16">
        <Link href="/entrar" className="flex w-fit items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <Gavel className="h-5 w-5" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-semibold">Controle de Intimações</span>
            <span className="block text-xs text-[#a7b0d4]">Comunica PJe · DJEN</span>
          </span>
        </Link>

        <div className="grid flex-1 items-center gap-16 py-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:gap-12">
          <div className="grid max-w-xl gap-6">
            <h1 className={`${serifa.className} text-[2.6rem] leading-none tracking-tight [text-shadow:0_2px_30px_rgb(4_7_15/.8)] [text-wrap:balance] sm:text-6xl xl:text-7xl`}>
              O direito não para. <em className="text-brand-300">Você também não precisa parar para procurar.</em>
            </h1>
            <p className="max-w-[40ch] text-base leading-relaxed text-[#a7b0d4] [text-shadow:0_1px_12px_rgb(4_7_15/.9)]">
              Capturamos suas intimações automaticamente para que nenhuma oportunidade de agir se perca no fluxo.
            </p>
          </div>

          <div className="w-full lg:justify-self-end lg:max-w-[440px]">
            <div id="cartao-acesso" className="animate-slide-in rounded-2xl bg-white p-6 text-slate-900 sm:p-8">
              {children}
            </div>
            <p className="mt-5 text-center text-xs text-[#a7b0d4]/70">Conexão protegida · cookies HttpOnly · sem rastreadores de terceiros</p>
          </div>
        </div>

        <p className={`${mono.className} text-[11px] tracking-wide text-[#a7b0d4]/50`}>Comunica PJe · Diário de Justiça Eletrônico Nacional</p>
      </div>
    </div>
  );
}
