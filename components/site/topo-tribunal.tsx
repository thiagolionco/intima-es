import Link from "next/link";
import type { CSSProperties } from "react";
import { ClepsaSimbolo } from "@/components/marca/clepsa-simbolo";
import { FundoTribunal } from "./tribunal/fundo-tribunal";
import s from "./topo-tribunal.module.css";

const NAVEGACAO = [
  { href: "#servicos", rotulo: "Serviços" },
  { href: "/sobre", rotulo: "Sobre" },
];

// Atrasos da entrada, em ms depois de carregar (iguais aos do modelo).
const ATRASO = { barra: 150, selo: 320, titulo: 480, subtitulo: 1150, formulario: 1450, rodape: 1650 };

const atraso = (ms: number) => ({ "--atraso": `${ms}ms` }) as CSSProperties;

/** Texto que aparece palavra por palavra (cada palavra sobe e acende com um pequeno atraso). */
function PorPalavra({ texto, inicio, intervalo, duracao, deslocamento }: { texto: string; inicio: number; intervalo: number; duracao: number; deslocamento: number }) {
  const palavras = texto.split(" ");
  return (
    <>
      {palavras.map((p, i) => (
        <span key={i}>
          <span
            className={s.palavra}
            style={{ "--atraso": `${inicio + i * intervalo}ms`, "--dur": `${duracao}ms`, "--de-palavra": `${deslocamento}px` } as CSSProperties}
          >
            {p}
          </span>
          {i < palavras.length - 1 ? " " : null}
        </span>
      ))}
    </>
  );
}

/**
 * Topo da página inicial em tela cheia: tribunal ateniense desenhado em luz ao fundo, véu escuro no
 * centro para o texto ficar legível e o conteúdo entrando em sequência.
 * O formulário leva o e-mail para a criação de conta, que já abre com ele preenchido.
 */
export function TopoTribunal() {
  return (
    <section className={s.topo} aria-labelledby="titulo-inicio">
      <FundoTribunal className={s.camada} />
      <div className={s.veu} aria-hidden />

      <header className={`${s.barra} ${s.bloco}`} style={atraso(ATRASO.barra)}>
        <Link href="/" className={s.marca} aria-label="Clepsa, página inicial">
          <ClepsaSimbolo cor="currentColor" />
          Clepsa
        </Link>
        <nav aria-label="Principal" className={s.links}>
          {NAVEGACAO.map((l) => (
            <Link key={l.href} href={l.href} className={s.link}>
              {l.rotulo}
            </Link>
          ))}
        </nav>
        <div className={s.acoes}>
          <Link href="/entrar" className={s.entrar}>
            Entrar
          </Link>
          <Link href="/criar-conta" className={s.pilula}>
            Começar agora
          </Link>
        </div>
      </header>

      <div className={s.centro}>
        <p className={`${s.selo} ${s.bloco}`} style={atraso(ATRASO.selo)}>
          Para escritórios de advocacia
        </p>
        <h1 id="titulo-inicio" className={s.titulo}>
          <PorPalavra texto="Nenhuma intimação passa despercebida." inicio={ATRASO.titulo} intervalo={85} duracao={720} deslocamento={26} />
        </h1>
        <p className={s.subtitulo}>
          <PorPalavra
            texto="Intimações, processos, clientes e teses do escritório num só lugar, com agentes de IA que trabalham junto com a equipe."
            inicio={ATRASO.subtitulo}
            intervalo={22}
            duracao={600}
            deslocamento={14}
          />
        </p>
        <div className={`${s.formulario} ${s.bloco}`} style={atraso(ATRASO.formulario)}>
          <form action="/criar-conta" method="get">
            <div className={s.campo}>
              <label htmlFor="email-inicio" className="sr-only">
                E-mail profissional
              </label>
              <input id="email-inicio" name="email" type="email" required autoComplete="email" placeholder="Seu e-mail profissional" />
              <button type="submit" className={s.pilula}>
                Criar conta
              </button>
            </div>
          </form>
        </div>
      </div>

      <footer className={`${s.rodape} ${s.bloco}`} style={atraso(ATRASO.rodape)}>
        Tempo bem administrado também é justiça.
      </footer>
    </section>
  );
}
