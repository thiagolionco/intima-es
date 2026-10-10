import { Clock } from "lucide-react";
import { Instrument_Serif, Inter } from "next/font/google";
import Link from "next/link";
import { GotaCaindo } from "@/components/auth/gota-caindo";
import { ClepsaMarca } from "@/components/marca/clepsa-simbolo";

const serifa = Instrument_Serif({ subsets: ["latin"], weight: ["400"], style: ["normal", "italic"], display: "swap" });
const sans = Inter({ subsets: ["latin"], display: "swap" });

/**
 * Layout das telas de acesso: a mensagem da Clepsa à esquerda, o formulário num cartão à direita
 * e, entre os dois, a gota que cai e abre ondas no fundo. Em telas estreitas vira uma coluna, com o cartão primeiro.
 */
export default function LayoutAcesso({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${sans.className} relative isolate min-h-screen overflow-hidden bg-[#050a18] text-slate-50`}>
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(55% 60% at 78% 48%, rgb(33 71 237 / .16), transparent 70%), radial-gradient(45% 50% at 18% 55%, rgb(33 71 237 / .07), transparent 70%)" }}
        aria-hidden
      />
      <GotaCaindo textoId="texto-acesso" cartaoId="cartao-acesso" />

      <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-4 py-6 sm:px-8 sm:py-8 lg:px-12">
        <Link href="/entrar" className="w-fit rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-400">
          <ClepsaMarca legenda="Monitoramento de intimações e prazos" />
        </Link>

        <main className="grid flex-1 content-center items-center gap-12 py-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:gap-16">
          <section id="texto-acesso" className="order-2 mx-auto w-full max-w-[480px] lg:order-1 lg:mx-0 lg:max-w-none">
            <h2 className={`${serifa.className} w-fit text-[40px] leading-[1.05] tracking-tight text-white sm:text-[52px] xl:text-[60px]`}>
              Nenhuma intimação <em className="block text-brand-300">passa despercebida.</em>
            </h2>
            <p className="mt-6 max-w-[42ch] text-[17px] leading-relaxed text-slate-300">Monitoramos as publicações jurídicas para você não perder prazos.</p>
            <div className="mt-10 flex max-w-[46ch] gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300 ring-1 ring-inset ring-brand-400/25">
                <Clock className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-[15px] font-medium text-slate-100">Clientes monitorados</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">Cadastre clientes, OABs e processos uma vez e consulte as novas publicações do Comunica PJe sempre que quiser.</p>
              </div>
            </div>
          </section>

          <div className="order-1 mx-auto w-full max-w-[480px] lg:order-2 lg:max-w-none">
            <div id="cartao-acesso" className="animate-slide-in rounded-2xl bg-white p-6 text-slate-900 shadow-[0_32px_64px_-32px_rgb(0_0_0/.7)] sm:p-10">{children}</div>
            <p className="mt-4 text-center text-xs leading-relaxed text-slate-400">Dados públicos do DJEN/CNJ. Produto independente, sem vínculo com o CNJ.</p>
          </div>
        </main>

        <footer className="text-[13px] leading-relaxed text-slate-400">© {new Date().getFullYear()} Clepsa · Fonte: Comunica PJe, Diário de Justiça Eletrônico Nacional</footer>
      </div>
    </div>
  );
}
