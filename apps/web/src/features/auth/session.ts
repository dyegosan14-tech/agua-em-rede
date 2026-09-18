import { sessionResponseSchema, type LoginRequest, type SessionResponse } from '@aer/contracts';
import type { Permission } from '@aer/domain';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError, api, onUnauthenticated, setCsrfToken } from '../../lib/api';

export const SESSION_KEY = ['session'] as const;

/**
 * Troca a sessão em cache e descarta todo o restante (dados de outro usuário nunca podem sobrar).
 * A query de sessão é atualizada NO LUGAR (setQueryData) em vez de `queryClient.clear()`: clear() remove o
 * objeto Query do cache sem notificar quem o observa, e os guardas de rota ficariam com a sessão antiga.
 */
function replaceSession(queryClient: QueryClient, session: SessionResponse | null): void {
  void queryClient.cancelQueries();
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== SESSION_KEY[0] });
  queryClient.setQueryData(SESSION_KEY, session);
}

/** Sessão atual, ou null quando não há sessão válida. Erros de rede continuam sendo erros (não viram "deslogado"). */
export function useSession() {
  const queryClient = useQueryClient();

  // Sessão derrubada no servidor (expirada, revogada, usuário desativado): reflete na hora.
  useEffect(
    () =>
      onUnauthenticated(() => {
        setCsrfToken(null);
        replaceSession(queryClient, null);
      }),
    [queryClient],
  );

  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async (): Promise<SessionResponse | null> => {
      try {
        const session = await api('/auth/me', { schema: sessionResponseSchema });
        setCsrfToken(session.csrfToken);
        return session;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setCsrfToken(null);
          return null;
        }
        throw error;
      }
    },
    staleTime: 5 * 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status > 0) && count < 2,
  });
}

export function useCan(permission: Permission): boolean {
  const { data } = useSession();
  return data?.permissions.includes(permission) ?? false;
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginRequest) => api('/auth/login', { method: 'POST', body: input, schema: sessionResponseSchema }),
    onSuccess: (session) => {
      setCsrfToken(session.csrfToken);
      replaceSession(queryClient, session);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      // Mesmo que a chamada falhe (ex.: sem rede), o estado local é descartado.
      // Rascunhos offline em IndexedDB (etapa de campo) também serão limpos aqui.
      setCsrfToken(null);
      replaceSession(queryClient, null);
    },
  });
}
