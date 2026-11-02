import Link from "next/link";

const RODAPE = [
  { href: "/sobre", rotulo: "Sobre" },
  { href: "/contato", rotulo: "Contato" },
  { href: "/seguranca", rotulo: "Segurança" },
  { href: "/privacidade", rotulo: "Privacidade" },
];

/** Rodapé do site público, igual em todas as páginas (início, sobre, contato, privacidade). */
export function RodapeSite() {
  return (
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
  );
}
