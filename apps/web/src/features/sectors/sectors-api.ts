import {
  listMaintenanceWindowsResponseSchema,
  listSectorsResponseSchema,
  maintenanceWindowSchema,
  sectorSchema,
  type CreateMaintenanceWindowRequest,
  type CreateSectorRequest,
  type ListSectorsQuery,
  type MaintenanceWindowDto,
  type UpdateSectorRequest,
} from '@aer/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export type SectorsFilter = Partial<Pick<ListSectorsQuery, 'search'>> & { limit: number; offset: number };

function toQueryString(filter: SectorsFilter): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function useSectors(filter: SectorsFilter) {
  return useQuery({
    queryKey: ['sectors', filter],
    queryFn: () => api(`/sectors?${toQueryString(filter)}`, { schema: listSectorsResponseSchema }),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
  });
}

export function useSector(id: string | null) {
  return useQuery({
    queryKey: ['sectors', id],
    queryFn: () => (id ? api(`/sectors/${id}`, { schema: sectorSchema }) : null),
    enabled: Boolean(id),
  });
}

function useInvalidatingMutation<TInput, TOutput>(fn: (input: TInput) => Promise<TOutput>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sectors'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });
}

export const useCreateSector = () =>
  useInvalidatingMutation((input: CreateSectorRequest) => api('/sectors', { method: 'POST', body: input, schema: sectorSchema }));

export const useUpdateSector = (id: string) =>
  useInvalidatingMutation((input: UpdateSectorRequest) => api(`/sectors/${id}`, { method: 'PATCH', body: input, schema: sectorSchema }));

export function useMaintenanceWindows(sectorId?: string | null) {
  return useQuery({
    queryKey: ['maintenance-windows', sectorId],
    queryFn: () => {
      const query = sectorId ? `?sectorId=${encodeURIComponent(sectorId)}` : '';
      return api(`/maintenance-windows${query}`, { schema: listMaintenanceWindowsResponseSchema });
    },
    enabled: sectorId !== undefined,
  });
}

export function useCreateMaintenanceWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMaintenanceWindowRequest) =>
      api<MaintenanceWindowDto>('/maintenance-windows', {
        method: 'POST',
        body: input,
        schema: maintenanceWindowSchema,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['maintenance-windows'] }),
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['sectors'] }),
      ]);
    },
  });
}

export function useCancelMaintenanceWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/maintenance-windows/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['maintenance-windows'] }),
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
      ]);
    },
  });
}
