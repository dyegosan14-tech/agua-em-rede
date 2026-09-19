import {
  deviceSchema,
  listDevicesResponseSchema,
  type CreateDeviceRequest,
  type ListDevicesQuery,
  type UpdateDeviceRequest,
} from '@aer/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export type DevicesFilter = Partial<Pick<ListDevicesQuery, 'search' | 'kind' | 'status' | 'sectorId'>> & {
  limit: number;
  offset: number;
};

function toQueryString(filter: DevicesFilter): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function useDevices(filter: DevicesFilter) {
  return useQuery({
    queryKey: ['devices', filter],
    queryFn: () => api(`/devices?${toQueryString(filter)}`, { schema: listDevicesResponseSchema }),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
  });
}

export function useDevice(id: string | null) {
  return useQuery({
    queryKey: ['devices', id],
    queryFn: () => (id ? api(`/devices/${id}`, { schema: deviceSchema }) : null),
    enabled: Boolean(id),
  });
}

function useInvalidatingMutation<TInput, TOutput>(fn: (input: TInput) => Promise<TOutput>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['devices'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });
}

export const useCreateDevice = () =>
  useInvalidatingMutation((input: CreateDeviceRequest) => api('/devices', { method: 'POST', body: input, schema: deviceSchema }));

export const useUpdateDevice = (id: string) =>
  useInvalidatingMutation((input: UpdateDeviceRequest) => api(`/devices/${id}`, { method: 'PATCH', body: input, schema: deviceSchema }));
