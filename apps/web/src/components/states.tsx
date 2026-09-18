import { CloudOff, Inbox, LoaderCircle, Lock, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { formatTime } from '../lib/format';
import { useOnlineStatus } from '../lib/hooks';
import { Button } from './ui';

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 p-10 text-slate-700">
      <LoaderCircle aria-hidden className="size-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Não foi possível carregar os dados' }: { error: unknown; onRetry?: () => void; title?: string }) {
  const apiError = error instanceof ApiError ? error : null;
  const offline = apiError?.isNetwork ?? false;
  const Icon = offline ? CloudOff : TriangleAlert;
  return (
    <div role="alert" className="mx-auto my-8 max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
      <Icon aria-hidden className="mx-auto size-8 text-red-800" />
      <h2 className="mt-2 text-base font-semibold text-red-900">{offline ? 'Sem conexão com o servidor' : title}</h2>
      <p className="mt-1 text-sm text-red-900">{apiError?.message ?? 'Ocorreu um erro inesperado.'}</p>
      {apiError?.requestId ? <p className="mt-1 text-xs text-red-800">Código da requisição: {apiError.requestId}</p> : null}
      {onRetry ? (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          <RefreshCw aria-hidden className="size-4" />
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mx-auto my-8 max-w-lg rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <Inbox aria-hidden className="mx-auto size-8 text-slate-500" />
      <h2 className="mt-2 text-base font-semibold text-slate-900">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-700">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ForbiddenState() {
  return (
    <div role="alert" className="mx-auto my-8 max-w-lg rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center">
      <Lock aria-hidden className="mx-auto size-8 text-amber-900" />
      <h2 className="mt-2 text-base font-semibold text-amber-950">Permissão insuficiente</h2>
      <p className="mt-1 text-sm text-amber-950">Seu perfil não tem acesso a esta área. Se precisar dela, peça a um administrador.</p>
    </div>
  );
}

/** Faixa global exibida quando o navegador está sem rede. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-950">
      <WifiOff aria-hidden className="size-4" />
      Sem conexão. Os dados exibidos podem estar desatualizados e novas ações não serão enviadas até a rede voltar.
    </div>
  );
}

/** Indica quando os dados foram atualizados e avisa quando a atualização falhou (dados desatualizados). */
export function FreshnessNote({ updatedAt, isFetching, failed, timeZone }: { updatedAt: number; isFetching: boolean; failed: boolean; timeZone: string }) {
  if (!updatedAt) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-700" aria-live="polite">
      {isFetching ? <span>Atualizando…</span> : <span>Atualizado às {formatTime(new Date(updatedAt), timeZone)}</span>}
      {failed ? (
        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-950">
          <TriangleAlert aria-hidden className="size-3.5" />
          Dados desatualizados: a última atualização falhou
        </span>
      ) : null}
    </p>
  );
}
