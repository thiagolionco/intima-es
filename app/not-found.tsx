import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Página não encontrada</h1>
      <Link href="/" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">
        Voltar ao painel
      </Link>
    </div>
  );
}
