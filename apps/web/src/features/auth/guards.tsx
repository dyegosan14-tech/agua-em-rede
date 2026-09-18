import type { Permission } from '@aer/domain';
import { Navigate, Outlet, useLocation } from 'react-router';
import { ErrorState, ForbiddenState, LoadingState } from '../../components/states';
import { useSession } from './session';

/** Protege rotas: sem sessão válida, envia para o login preservando o destino. */
export function RequireAuth() {
  const location = useLocation();
  const session = useSession();

  if (session.isPending) return <LoadingState label="Verificando sua sessão…" />;
  if (session.isError) return <ErrorState error={session.error} onRetry={() => void session.refetch()} title="Não foi possível verificar sua sessão" />;
  if (!session.data) return <Navigate to="/entrar" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** A interface só oculta o que a API recusaria; a autorização real é sempre a da API. */
export function RequirePermission({ permission }: { permission: Permission }) {
  const session = useSession();
  if (!session.data?.permissions.includes(permission)) return <ForbiddenState />;
  return <Outlet />;
}
