import { Onest } from "next/font/google";
import { RodapeSite } from "@/components/site/rodape-site";
import { RolagemSuave } from "@/components/site/rolagem-suave";

const sans = Onest({ subsets: ["latin"], weight: ["400", "500"], display: "swap" });

/**
 * Layout só da página inicial pública: o topo em tela cheia (com a tinta em fluido) traz a
 * própria barra de navegação, por isso aqui não há cabeçalho. As demais páginas do site
 * usam app/(site)/layout.tsx.
 */
export default function LayoutInicio({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${sans.className} relative isolate flex min-h-screen flex-col bg-[#04050c] text-slate-50`}>
      <RolagemSuave />
      <main className="w-full flex-1">{children}</main>
      <RodapeSite />
    </div>
  );
}
