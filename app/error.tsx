"use client";

export default function Erro({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-24 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Algo deu errado</h1>
      <p className="mt-2 text-sm text-slate-500">{error.message}</p>
      <button onClick={reset} className="mt-6 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
        Tentar novamente
      </button>
    </div>
  );
}
