import { Fingerprint, Gavel, History, KeyRound, LockKeyhole, Users } from "lucide-react";
import Link from "next/link";

const DESTAQUES = [
  { icone: LockKeyhole, titulo: "Seu espaço, só seu", texto: "Cada conta tem acervo, clientes e buscas isolados no servidor." },
  { icone: Fingerprint, titulo: "Verificação em duas etapas", texto: "Códigos do Google Authenticator, Microsoft Authenticator ou Authy." },
  { icone: KeyRound, titulo: "Senhas protegidas com scrypt", texto: "Bloqueio automático após tentativas incorretas e alertas por e-mail." },
  { icone: History, titulo: "Auditoria completa", texto: "Veja cada acesso, dispositivo conectado e alteração de segurança." },
];

/** Layout dividido das telas de acesso: painel institucional à esquerda, formulário à direita. */
export default function LayoutAcesso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white">
      <aside className="relative hidden w-[46%] max-w-2xl flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-indigo-500/20 blur-3xl" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "24px 24px" }}
          aria-hidden
        />

        <Link href="/entrar" className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <Gavel className="h-5 w-5" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold">Controle de Intimações</span>
            <span className="block text-xs text-slate-400">Comunica PJe · DJEN</span>
          </span>
        </Link>

        <div className="relative">
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">Sua carteira de intimações, protegida como um sistema corporativo.</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">Acompanhe prazos de todos os clientes com segurança de nível profissional e controle total sobre quem acessa sua conta.</p>
          <ul className="mt-10 grid gap-6">
            {DESTAQUES.map(({ icone: Icone, titulo, texto }) => (
              <li key={titulo} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
                  <Icone className="h-5 w-5 text-brand-300" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-medium">{titulo}</span>
                  <span className="mt-0.5 block text-sm text-slate-400">{texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-2 text-xs text-slate-500">
          <Users className="h-3.5 w-3.5" aria-hidden />
          Tratamento de dados conforme a LGPD · exportação e exclusão da conta a qualquer momento
        </p>
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
