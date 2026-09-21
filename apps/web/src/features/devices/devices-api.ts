import {
  createDeviceCredentialResponseSchema,
  deviceCredentialSchema,
  deviceSchema,
  listDevicesResponseSchema,
  type CreateDeviceCredentialResponse,
  type CreateDeviceRequest,
  type DeviceCredentialDto,
  type ListDevicesQuery,
  type UpdateDeviceRequest,
} from '@aer/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
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

export function useDeviceCredentials(deviceId: string | null) {
  return useQuery({
    queryKey: ['device-credentials', deviceId],
    queryFn: () =>
      deviceId
        ? api<DeviceCredentialDto[]>(`/devices/${deviceId}/credentials`, {
            schema: z.array(deviceCredentialSchema),
          })
        : [],
    enabled: Boolean(deviceId),
  });
}

export function useCreateDeviceCredential(deviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (label?: string) =>
      api<CreateDeviceCredentialResponse>(`/devices/${deviceId}/credentials`, {
        method: 'POST',
        body: { label },
        schema: createDeviceCredentialResponseSchema,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['device-credentials', deviceId] });
    },
  });
}

export function useRevokeDeviceCredential(deviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentialId: string) =>
      api<{ success: boolean }>(`/devices/${deviceId}/credentials/${credentialId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['device-credentials', deviceId] });
    },
  });
}
