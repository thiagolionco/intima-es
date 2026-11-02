import { Inter } from "next/font/google";
import Link from "next/link";
import { ClepsaMarca } from "@/components/marca/clepsa-simbolo";
import { RodapeSite } from "@/components/site/rodape-site";

const sans = Inter({ subsets: ["latin"], display: "swap" });

const NAVEGACAO = [
  { href: "/#servicos", rotulo: "Serviços" },
  { href: "/sobre", rotulo: "Sobre" },
];

/** Site público (sobre, contato, privacidade; o início tem layout próprio em app/(inicio)): renderizado no servidor, legível sem JavaScript. */
export default function LayoutSite({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${sans.className} relative isolate flex min-h-screen flex-col bg-[#050a18] text-slate-50`}>
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(55% 40% at 78% 10%, rgb(33 71 237 / .16), transparent 70%), radial-gradient(45% 40% at 10% 30%, rgb(33 71 237 / .07), transparent 70%)" }}
        aria-hidden
      />
      <header className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-8 lg:px-12">
        <Link href="/" className="block w-fit rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-400">
          <ClepsaMarca />
        </Link>
        <nav aria-label="Principal" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {NAVEGACAO.map((l) => (
            <Link key={l.href} href={l.href} className="hidden text-slate-300 hover:text-white lg:inline">
              {l.rotulo}
            </Link>
          ))}
          <Link href="/entrar" className="text-slate-200 hover:text-white">
            Entrar
          </Link>
          <Link href="/criar-conta" className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-500">
            Começar agora
          </Link>
        </nav>
      </header>

      <main className="w-full flex-1">{children}</main>

      <RodapeSite />
    </div>
  );
}
