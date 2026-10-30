import { Database, EyeOff, FileLock2, KeyRound, Link2, MapPin, ScrollText, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Segurança e privacidade",
  description: "Como o Clepsa protege os dados do escritório e dos clientes: onde ficam, quem vê, como a IA usa e como apagar.",
};

function Item({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">{icone}</span>
      <div>
        <h2 className="font-semibold text-slate-900">{titulo}</h2>
        <div className="mt-1 space-y-2 text-sm leading-relaxed text-slate-700">{children}</div>
      </div>
    </li>
  );
}

/** Página pública de segurança e LGPD, para o escritório mostrar a clientes e parceiros. */
export default function SegurancaPage() {
  return (
    <article className="space-y-8">
      <header>
        <p className="text-sm font-medium text-brand-700">Clepsa</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-900">Segurança e privacidade</h1>
        <p className="mt-3 text-slate-600">
          O Clepsa guarda dados sigilosos de escritórios de advocacia e dos clientes deles. Esta página explica, sem letras miúdas, onde esses dados ficam, quem consegue vê-los e o que
          acontece quando a inteligência artificial é usada.
        </p>
      </header>

      <ul className="space-y-6">
        <Item icone={<MapPin className="h-5 w-5" />} titulo="Dados no Brasil">
          <p>O banco de dados fica em São Paulo (Supabase, região sa-east-1) e o servidor da aplicação também roda em São Paulo. A conexão é sempre criptografada (HTTPS com HSTS).</p>
        </Item>
        <Item icone={<Database className="h-5 w-5" />} titulo="Cada escritório só vê o que é dele">
          <p>
            A separação não depende só do código da tela: o próprio banco de dados aplica regras de acesso por escritório em cada tabela (Row Level Security). Mesmo um erro de programação
            não mostra os dados de um escritório a outro.
          </p>
          <p>Processos marcados como particulares só aparecem para quem os cadastrou, inclusive nas tabelas de revisão, no assistente e no portal do cliente.</p>
        </Item>
        <Item icone={<KeyRound className="h-5 w-5" />} titulo="Acesso protegido">
          <p>
            Senhas guardadas com scrypt (nunca em texto), verificação em duas etapas por aplicativo autenticador com códigos de recuperação, limite de tentativas e registro de cada login. Papéis
            no escritório (dono, advogado, estagiário) limitam o que cada pessoa pode fazer.
          </p>
        </Item>
        <Item icone={<Sparkles className="h-5 w-5" />} titulo="Inteligência artificial">
          <p>
            As ferramentas de IA usam a API da Anthropic (Claude). Pelos termos comerciais da Anthropic, o que é enviado pela API não é usado para treinar modelos. Os PDFs e textos vão só
            no momento da tarefa pedida e não ficam guardados lá para outros fins.
          </p>
          <p>
            A IA sempre mostra de onde tirou cada informação (documento e página, ou o link da fonte oficial) e o Clepsa confere as citações de súmulas, temas e artigos antes de você usar.
            Nada sai do escritório sem uma pessoa revisar: a IA não protocola, não envia e-mail e não responde a clientes sozinha.
          </p>
        </Item>
        <Item icone={<Link2 className="h-5 w-5" />} titulo="Links para clientes">
          <p>
            O portal do cliente e o formulário de atendimento usam endereços secretos e longos. O Clepsa guarda só a impressão digital do endereço (não o endereço em si), cada link tem
            validade, pode ser desligado na hora e mostra só o que o escritório escolheu. Pareceres e análises internas nunca aparecem no portal.
          </p>
        </Item>
        <Item icone={<FileLock2 className="h-5 w-5" />} titulo="Documentos">
          <p>PDFs ficam em armazenamento privado, acessível só pelo escritório (ou pelo cliente, quando o escritório compartilha um PDF específico no portal).</p>
        </Item>
        <Item icone={<ScrollText className="h-5 w-5" />} titulo="LGPD">
          <p>
            O escritório é o controlador dos dados dos clientes; o Clepsa trata esses dados em nome dele, só para prestar o serviço. Os formulários públicos pedem consentimento expresso antes
            de enviar e avisam para não mandar senhas ou documentos.
          </p>
        </Item>
        <Item icone={<Trash2 className="h-5 w-5" />} titulo="Exportar e apagar">
          <p>
            Em <strong>Dados e backup</strong>, o escritório baixa tudo em JSON a qualquer momento. Em <strong>Minha conta</strong>, dá para excluir a conta: os dados são apagados do banco,
            sem ficar em uso.
          </p>
        </Item>
        <Item icone={<EyeOff className="h-5 w-5" />} titulo="Sem venda nem propaganda">
          <p>O Clepsa não vende dados, não usa rastreadores de propaganda e não compartilha informações do escritório com terceiros além dos fornecedores necessários ao serviço.</p>
        </Item>
      </ul>

      <footer className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        <p className="flex items-center gap-2 font-medium text-slate-900">
          <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden /> Encontrou um problema de segurança?
        </p>
        <p className="mt-1">
          Escreva para o responsável pelo Clepsa pelo e-mail de suporte informado na sua conta. Respondemos e corrigimos com prioridade. <Link href="/entrar" className="text-brand-700 hover:underline">Entrar no Clepsa</Link>
        </p>
      </footer>
    </article>
  );
}
