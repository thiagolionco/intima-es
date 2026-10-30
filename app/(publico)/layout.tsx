import type { Metadata } from "next";
import Link from "next/link";
import { ClepsaSimbolo } from "@/components/marca/clepsa-simbolo";

export const metadata: Metadata = {
  // Os links do portal e do formulário levam um código no endereço: não vai para outros sites.
  referrer: "no-referrer",
};

/** Páginas abertas a quem não tem conta: portal do cliente, formulário de atendimento e segurança. */
export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-slate-500 sm:px-6">
          <span className="inline-flex items-center gap-1.5">
            <ClepsaSimbolo className="h-4 w-4" /> Feito com o Clepsa
          </span>
          <Link href="/seguranca" className="hover:text-slate-800 hover:underline">
            Segurança e privacidade
          </Link>
        </div>
      </footer>
    </div>
  );
}
