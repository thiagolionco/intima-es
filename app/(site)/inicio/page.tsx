import { AlarmClock, ArrowRight, BellRing, Bot, CalendarCheck2, Check, Database, FileStack, KeyRound, MapPin, Radar, ShieldCheck, UserPlus, UsersRound, X } from "lucide-react";
import { Instrument_Serif } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { CampoDeLetras } from "@/components/auth/campo-de-letras";
import { GotaCaindo } from "@/components/auth/gota-caindo";
import { metadadosDaPagina } from "@/components/site/pagina-site";
import { PainelIlustrado } from "@/components/site/painel-ilustrado";
import { paginaPublicaObrigatoria } from "@/lib/publico/conteudo";
import { dadosEstruturados, jsonParaScript } from "@/lib/publico/jsonld";

const serifa = Instrument_Serif({ subsets: ["latin"], weight: ["400"], style: ["normal", "italic"], display: "swap" });

const pagina = paginaPublicaObrigatoria("/");

export const metadata = metadadosDaPagina(pagina);

const FUNCIONALIDADES = [
  { icone: Radar, titulo: "Busca automática", texto: "A cada 6 horas o Clepsa consulta o Comunica PJe pelos nomes e números de OAB que o escritório monitora." },
  { icone: AlarmClock, titulo: "Prazos com responsável", texto: "Cada intimação ganha prazo, responsável e situação: nova, em análise, respondida ou arquivada." },
  { icone: BellRing, titulo: "Avisos e tela Hoje", texto: "Avisos por e-mail e uma tela com o que venceu, o que vence hoje e amanhã e o que acabou de chegar." },
  { icone: FileStack, titulo: "Processos por fase", texto: "Andamentos do DataJud, documentos em PDF, pareceres e um quadro que mostra em que fase está cada caso." },
  { icone: Bot, titulo: "Inteligência artificial", texto: "Resumos e sugestões sempre com a fonte. Nada é usado sem uma pessoa revisar antes." },
  { icone: UsersRound, titulo: "Equipe e relatórios", texto: "Papéis de dono, advogado e estagiário, processos particulares, relatórios para clientes e Google Agenda." },
];

const PASSOS = [
  { icone: UserPlus, titulo: "Crie a conta do escritório", texto: "Convide a equipe e defina o papel de cada pessoa." },
  { icone: Radar, titulo: "Cadastre quem monitorar", texto: "Clientes, advogados e números de OAB. Uma vez só." },
  { icone: CalendarCheck2, titulo: "O Clepsa vigia o diário", texto: "Cada intimação nova entra na lista com o prazo contado." },
  { icone: Check, titulo: "A equipe cumpre", texto: "Responsável, aviso e registro do que foi feito." },
];

const SEGURANCA = [
  { icone: Database, titulo: "Separação por escritório", texto: "A separação é feita no próprio banco de dados. Um escritório nunca vê os dados de outro." },
  { icone: KeyRound, titulo: "Acesso por papel", texto: "O dono decide quem entra e o que cada pessoa da equipe pode ver e mudar." },
  { icone: MapPin, titulo: "Dados no Brasil", texto: "O banco de dados e o servidor ficam em São Paulo, com conexão sempre criptografada." },
  { icone: ShieldCheck, titulo: "IA sob revisão", texto: "A IA sugere e mostra a fonte. Quem decide é sempre uma pessoa." },
];

// Faixa da vigília: 14 dias verificados, um com falha na consulta, para ilustrar a diferença.
const DIAS_VIGILIA = ["ok", "ok", "ok", "ok", "ok", "ok", "falha", "ok", "ok", "ok", "ok", "ok", "ok", "hoje"] as const;

function Titulo({ antes, destaque, depois, id }: { antes: string; destaque: string; depois?: string; id?: string }) {
  return (
    <h2 id={id} className={`${serifa.className} text-[36px] leading-[1.05] tracking-tight text-white sm:text-[44px]`}>
      {antes} <em className="text-brand-300">{destaque}</em>
      {depois}
    </h2>
  );
}

function Secao({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto w-full max-w-[1200px] scroll-mt-8 px-4 sm:px-8 lg:px-12 ${className}`}>
      {children}
    </section>
  );
}

/**
 * Página inicial pública. O middleware a serve em "/" para quem ainda não entrou; com login,
 * "/" continua sendo o Painel. O texto em Markdown para agentes continua vindo de lib/publico/conteudo.ts.
 */
export default function InicioPublicoPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonParaScript(dadosEstruturados()) }} />
      <CampoDeLetras atenuarIds={["texto-inicio"]} />
      <GotaCaindo textoId="texto-inicio" cartaoId="painel-inicio" />

      <Secao className="grid items-center gap-14 pb-20 pt-10 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:gap-16">
        <div id="texto-inicio" className="space-y-7">
          <p className="w-fit rounded-full bg-white/[.04] px-3 py-1 text-[13px] text-slate-300 ring-1 ring-inset ring-white/10">
            Monitoramento de intimações do Comunica PJe
          </p>
          <p className={`${serifa.className} w-fit text-[44px] leading-[1.02] tracking-tight text-white sm:text-[60px] xl:text-[68px]`}>
            Nenhuma intimação <em className="block text-brand-300">passa despercebida.</em>
          </p>
          <h1 className="max-w-[34ch] text-lg font-medium leading-snug text-slate-100 sm:text-xl">
            O Clepsa vigia o Diário de Justiça Eletrônico pelo seu escritório e transforma cada intimação em um prazo com responsável.
          </h1>
          <div className="flex flex-wrap gap-3">
            <Link href="/criar-conta" className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 font-medium text-white hover:bg-brand-500">
              Começar agora <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="#como-funciona" className="rounded-lg px-5 py-3 font-medium text-slate-100 ring-1 ring-inset ring-white/20 hover:bg-white/5">
              Ver como funciona
            </Link>
          </div>
        </div>
        <PainelIlustrado />
      </Secao>

      <div className="border-t border-white/5" />

      <Secao id="funcionalidades" className="py-20">
        <Titulo antes="O que o" destaque="Clepsa faz" />
        <p className="mt-4 max-w-[52ch] text-[17px] text-slate-300">Do diário oficial ao prazo cumprido, num só lugar e com a equipe inteira olhando para a mesma lista.</p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FUNCIONALIDADES.map(({ icone: Icone, titulo, texto }) => (
            <li key={titulo} className="group rounded-2xl bg-white/[.025] p-6 ring-1 ring-inset ring-white/[.07] transition hover:bg-white/[.045] hover:ring-brand-400/30">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300 ring-1 ring-inset ring-brand-400/20">
                <Icone className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-5 font-medium text-white">{titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{texto}</p>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao id="como-funciona" className="py-20">
        <div className="grid gap-12 lg:grid-cols-[280px_1fr]">
          <div>
            <Titulo antes="Como" destaque="funciona" />
            <p className="mt-4 text-[17px] leading-relaxed text-slate-300">
              Simples para começar.
              <br />
              Completo para trabalhar.
            </p>
          </div>
          <ol className="relative grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
            {/* A linha d'água que liga os passos, como o nível de uma clepsidra. */}
            <span className="pointer-events-none absolute left-6 right-6 top-6 hidden h-px bg-gradient-to-r from-brand-500/60 via-brand-400/30 to-transparent xl:block" aria-hidden />
            {PASSOS.map(({ icone: Icone, titulo, texto }, i) => (
              <li key={titulo} className="relative">
                <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#0b1736] text-brand-300 ring-1 ring-inset ring-brand-400/40">
                  <Icone className="h-5 w-5" aria-hidden />
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white">{i + 1}</span>
                </span>
                <h3 className="mt-5 font-medium text-white">{titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </Secao>

      <Secao id="vigilia" className="py-20">
        <div className="grid items-center gap-12 rounded-3xl bg-gradient-to-br from-brand-600/[.12] to-transparent p-6 ring-1 ring-inset ring-white/[.07] sm:p-10 lg:grid-cols-2">
          <div>
            <Titulo antes="Sem resultado não é" destaque="sem intimação." />
            <p className="mt-5 text-[17px] leading-relaxed text-slate-300">
              Quando uma consulta ao diário falha, uma tela vazia pode parecer um dia tranquilo. O Clepsa registra cada dia verificado e avisa quando uma verificação não deu certo.
              Você sabe exatamente o que foi conferido.
            </p>
          </div>
          <div aria-label="Ilustração: dias verificados nas últimas duas semanas, com um dia em que a consulta falhou" role="img">
            <div className="grid grid-cols-7 gap-2 sm:gap-3">
              {DIAS_VIGILIA.map((d, i) => (
                <span
                  key={i}
                  className={
                    d === "falha"
                      ? "flex aspect-square items-center justify-center rounded-xl bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-300/40"
                      : d === "hoje"
                        ? "flex aspect-square items-center justify-center rounded-xl bg-brand-600 text-white shadow-[0_0_24px_rgb(55_102_248/.5)]"
                        : "flex aspect-square items-center justify-center rounded-xl bg-white/[.04] text-brand-300 ring-1 ring-inset ring-white/10"
                  }
                >
                  {d === "falha" ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                </span>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-brand-300" /> Dia verificado
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-300" /> Falha avisada
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-brand-600" /> Hoje
              </span>
            </div>
          </div>
        </div>
      </Secao>

      <Secao id="seguranca" className="py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,360px)_1fr]">
          <div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300 ring-1 ring-inset ring-brand-400/25">
              <ShieldCheck className="h-6 w-6" aria-hidden />
            </span>
            <div className="mt-6">
              <Titulo antes="Segurança e" destaque="privacidade" />
            </div>
            <p className="mt-4 leading-relaxed text-slate-300">Os dados do escritório e dos clientes são sigilosos e são tratados assim, do banco de dados até a tela.</p>
            <Link href="/seguranca" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-brand-300 hover:text-brand-200">
              Como protegemos os dados <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-2xl bg-white/[.07] ring-1 ring-inset ring-white/[.07] sm:grid-cols-2">
            {SEGURANCA.map(({ icone: Icone, titulo, texto }) => (
              <li key={titulo} className="bg-[#060c1d] p-6">
                <Icone className="h-5 w-5 text-brand-300" aria-hidden />
                <h3 className="mt-4 font-medium text-white">{titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </Secao>

      <Secao className="pb-20 pt-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-700/40 via-brand-800/30 to-[#0a1430] p-8 ring-1 ring-inset ring-brand-400/20 sm:p-12">
          <svg viewBox="0 0 32 32" className="pointer-events-none absolute -right-16 -top-10 h-80 w-80 opacity-[.07]" aria-hidden>
            <path d="M16 3.5c1.6 3.4 5 5.6 5 9.1a5 5 0 0 1-10 0c0-3.5 3.4-5.7 5-9.1Z" fill="#90b6ff" />
          </svg>
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className={`${serifa.className} text-[34px] leading-[1.1] tracking-tight text-white sm:text-[42px]`}>
                Tempo bem administrado
                <em className="block text-brand-300">também é justiça.</em>
              </p>
              <p className="mt-4 max-w-[46ch] text-slate-300">Crie a conta do escritório e cadastre o primeiro cliente em poucos minutos.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/criar-conta" className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 font-medium text-white hover:bg-brand-500">
                Começar agora <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/entrar" className="rounded-lg px-5 py-3 font-medium text-slate-100 ring-1 ring-inset ring-white/20 hover:bg-white/5">
                Já tenho conta
              </Link>
            </div>
          </div>
        </div>
      </Secao>
    </>
  );
}
