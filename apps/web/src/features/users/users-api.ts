import {
  listUsersResponseSchema,
  revokeSessionsResponseSchema,
  userSchema,
  type CreateUserRequest,
  type ListUsersQuery,
  type ResetPasswordRequest,
  type UpdateUserRequest,
} from '@aer/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export type UsersFilter = Partial<Pick<ListUsersQuery, 'search' | 'role'>> & { isActive?: 'true' | 'false'; limit: number; offset: number };

function toQueryString(filter: UsersFilter): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function useUsers(filter: UsersFilter) {
  return useQuery({
    queryKey: ['users', filter],
    queryFn: () => api(`/users?${toQueryString(filter)}`, { schema: listUsersResponseSchema }),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
  });
}

function useInvalidatingMutation<TInput, TOutput>(fn: (input: TInput) => Promise<TOutput>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export const useCreateUser = () =>
  useInvalidatingMutation((input: CreateUserRequest) => api('/users', { method: 'POST', body: input, schema: userSchema }));

export const useUpdateUser = (id: string) =>
  useInvalidatingMutation((input: UpdateUserRequest) => api(`/users/${id}`, { method: 'PATCH', body: input, schema: userSchema }));

export const useResetPassword = (id: string) =>
  useInvalidatingMutation((input: ResetPasswordRequest) =>
    api(`/users/${id}/reset-password`, { method: 'POST', body: input, schema: revokeSessionsResponseSchema }),
  );

export const useRevokeSessions = (id: string) =>
  useInvalidatingMutation(() => api(`/users/${id}/revoke-sessions`, { method: 'POST', schema: revokeSessionsResponseSchema }));
