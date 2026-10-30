import { Instrument_Serif, Inter } from "next/font/google";
import Link from "next/link";
import { CampoDeLetras } from "@/components/auth/campo-de-letras";
import { GotaCaindo } from "@/components/auth/gota-caindo";
import { ClepsaMarca } from "@/components/marca/clepsa-simbolo";

const serifa = Instrument_Serif({ subsets: ["latin"], weight: ["400"], style: ["normal", "italic"], display: "swap" });
const sans = Inter({ subsets: ["latin"], display: "swap" });

/**
 * Layout das telas de acesso: a mensagem da Clepsa à esquerda, o formulário num cartão à direita
 * e, entre os dois, a gota que cai e abre ondas no fundo. Atrás de tudo, letras que aparecem onde o cursor passa. Em telas estreitas vira uma coluna, com o cartão primeiro.
 */
export default function LayoutAcesso({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${sans.className} relative isolate min-h-screen overflow-hidden bg-[#050a18] text-slate-50`}>
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(55% 60% at 78% 48%, rgb(33 71 237 / .16), transparent 70%), radial-gradient(45% 50% at 18% 55%, rgb(33 71 237 / .07), transparent 70%)" }}
        aria-hidden
      />
      <CampoDeLetras atenuarIds={["marca-acesso", "texto-acesso"]} />
      <GotaCaindo textoId="texto-acesso" cartaoId="cartao-acesso" />

      <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-4 py-6 sm:px-8 sm:py-8 lg:px-12">
        <div id="marca-acesso" className="w-fit">
          <Link href="/entrar" className="block w-fit rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-400">
            <ClepsaMarca legenda="Monitoramento de intimações e prazos" />
          </Link>
        </div>

        <main className="grid flex-1 content-center items-center gap-12 py-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:gap-16">
          <section id="texto-acesso" className="order-2 mx-auto w-full max-w-[480px] lg:order-1 lg:mx-0 lg:max-w-none">
            <h2 className={`${serifa.className} w-fit text-[40px] leading-[1.05] tracking-tight text-white sm:text-[52px] xl:text-[60px]`}>
              Nenhuma intimação <em className="block text-brand-300">passa despercebida.</em>
            </h2>
            <p className="mt-6 max-w-[42ch] text-[17px] leading-relaxed text-slate-300">Monitoramos as publicações jurídicas para você não perder prazos.</p>
          </section>

          <div className="order-1 mx-auto w-full max-w-[480px] lg:order-2 lg:max-w-none">
            <div id="cartao-acesso" className="animate-slide-in rounded-2xl bg-white p-6 text-slate-900 shadow-[0_32px_64px_-32px_rgb(0_0_0/.7)] sm:p-10">{children}</div>
          </div>
        </main>

        <footer className="text-[13px] leading-relaxed text-slate-400">© {new Date().getFullYear()} Clepsa · Fonte: Comunica PJe, Diário de Justiça Eletrônico Nacional ·{" "}
          <Link href="/seguranca" className="underline hover:text-slate-200">
            Segurança e privacidade
          </Link>
        </footer>
      </div>
    </div>
  );
}
