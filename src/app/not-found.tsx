import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md space-y-3 rounded-xl border bg-white p-6 text-center">
        <div className="text-xs font-semibold text-amber-700">Dados simulados — versão de demonstração</div>
        <h1 className="text-lg font-semibold">Página não encontrada</h1>
        <p className="text-sm text-slate-600">O endereço não existe ou o item foi removido.</p>
        <Link href="/" className="inline-block rounded-md bg-emerald-700 px-4 py-2 text-sm text-white">
          Ir para o Início
        </Link>
      </div>
    </div>
  );
}
