import { Gavel } from "lucide-react";
import { Instrument_Serif, JetBrains_Mono } from "next/font/google";
import Link from "next/link";

const serifa = Instrument_Serif({ subsets: ["latin"], weight: "400", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: "500", display: "swap" });

/** Selo decorativo que gira devagar no fundo do painel, como um carimbo. */
function Selo() {
  return (
    <div className="pointer-events-none absolute -right-24 top-1/2 h-[22rem] w-[22rem] -translate-y-[58%] opacity-50" aria-hidden>
      <svg viewBox="0 0 300 300" className="h-full w-full animate-girar-lento motion-reduce:animate-none">
        <defs>
          <path id="selo-anel" d="M150,150 m-120,0 a120,120 0 1,1 240,0 a120,120 0 1,1 -240,0" />
        </defs>
        <circle cx="150" cy="150" r="138" fill="none" stroke="#90b6ff" strokeWidth="1" />
        <circle cx="150" cy="150" r="104" fill="none" stroke="#90b6ff" strokeWidth="1" strokeDasharray="2 6" />
        <text className={mono.className} fill="#90b6ff" fontSize="11.5" letterSpacing="3.2">
          <textPath href="#selo-anel">CARTEIRA DE INTIMAÇÕES · COMUNICA PJE · DIÁRIO DE JUSTIÇA ·</textPath>
        </text>
      </svg>
    </div>
  );
}

/** Layout dividido das telas de acesso: painel institucional à esquerda, formulário à direita. */
export default function LayoutAcesso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white">
      <aside className="relative hidden w-[46%] max-w-2xl flex-col justify-between overflow-hidden bg-[#070b1d] p-12 text-[#eef1ff] lg:flex">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 0% 0%, rgb(33 71 237 / .35), transparent 70%), radial-gradient(70% 60% at 85% 30%, rgb(92 141 253 / .18), transparent 70%)",
          }}
          aria-hidden
        />
        <Selo />

        <Link href="/entrar" className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <Gavel className="h-5 w-5" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold">Controle de Intimações</span>
            <span className="block text-xs text-slate-400">Comunica PJe · DJEN</span>
          </span>
        </Link>

        <div className="relative grid max-w-sm gap-4">
          <span className={`${mono.className} text-[11px] uppercase tracking-[0.14em] text-brand-300`}>Para advogados e escritórios</span>
          <h2 className={`${serifa.className} text-5xl leading-none tracking-tight xl:text-6xl`}>Sua carteira de intimações.</h2>
          <p className="text-sm leading-relaxed text-[#a7b0d4]">As publicações dos seus clientes, organizadas por processo e por prazo.</p>
        </div>

        <p className={`${mono.className} relative text-[11px] tracking-wide text-slate-500`}>Comunica PJe · DJEN</p>
      </aside>

      <main className="flex flex-1 flex-col">
        <div className="flex items-center gap-2 px-6 pt-6 lg:hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Gavel className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-slate-900">Controle de Intimações</span>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-[420px] animate-slide-in">{children}</div>
        </div>
        <footer className="px-6 pb-6 text-center text-xs text-slate-400">Conexão protegida · cookies HttpOnly · sem rastreadores de terceiros</footer>
      </main>
    </div>
  );
}
