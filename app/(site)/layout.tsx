import { Inter } from "next/font/google";
import Link from "next/link";
import { ClepsaMarca } from "@/components/marca/clepsa-simbolo";

const sans = Inter({ subsets: ["latin"], display: "swap" });

const NAVEGACAO = [
  { href: "/#funcionalidades", rotulo: "Funcionalidades" },
  { href: "/#como-funciona", rotulo: "Como funciona" },
  { href: "/#seguranca", rotulo: "Segurança" },
  { href: "/sobre", rotulo: "Sobre" },
];

const RODAPE = [
  { href: "/sobre", rotulo: "Sobre" },
  { href: "/contato", rotulo: "Contato" },
  { href: "/seguranca", rotulo: "Segurança" },
  { href: "/privacidade", rotulo: "Privacidade" },
];

/** Site público (início, sobre, contato, privacidade): renderizado no servidor, legível sem JavaScript. */
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

      <footer className="mx-auto w-full max-w-[1200px] px-4 py-6 text-[13px] leading-relaxed text-slate-400 sm:px-8 lg:px-12">
        <nav aria-label="Rodapé" className="flex flex-wrap gap-x-4 gap-y-1">
          {RODAPE.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-slate-200">
              {l.rotulo}
            </Link>
          ))}
        </nav>
        <p className="mt-2">© {new Date().getFullYear()} Clepsa · Fonte: Comunica PJe, Diário de Justiça Eletrônico Nacional</p>
      </footer>
    </div>
  );
}
