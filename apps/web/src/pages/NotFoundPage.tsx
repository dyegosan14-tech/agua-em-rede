import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="mx-auto my-16 max-w-md text-center">
      <p className="text-sm font-semibold text-brand-700">Erro 404</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">Página não encontrada</h1>
      <p className="mt-2 text-sm text-slate-700">O endereço acessado não existe ou foi movido.</p>
      <Link to="/" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">
        Voltar ao início
      </Link>
    </div>
  );
}
