import {
  listWorkOrdersResponseSchema,
  workOrderAttachmentSchema,
  workOrderDtoSchema,
  type CreateWorkOrderRequest,
  type ListWorkOrdersQuery,
  type UpdateWorkOrderRequest,
  type UploadAttachmentRequest,
  type WorkOrderAttachmentDto,
  type WorkOrderDto,
} from '@aer/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../../lib/api';

export type WorkOrdersFilter = Partial<Omit<ListWorkOrdersQuery, 'limit' | 'offset'>> & {
  limit: number;
  offset: number;
};

function toQueryString(filter: WorkOrdersFilter): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function useWorkOrders(filter: WorkOrdersFilter) {
  return useQuery({
    queryKey: ['work-orders', filter],
    queryFn: () => api(`/work-orders?${toQueryString(filter)}`, { schema: listWorkOrdersResponseSchema }),
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
  });
}

export function useWorkOrder(id: string | null) {
  return useQuery({
    queryKey: ['work-orders', id],
    queryFn: () => (id ? api(`/work-orders/${id}`, { schema: workOrderDtoSchema }) : null),
    enabled: Boolean(id),
  });
}

export function useCreateWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkOrderRequest) =>
      api<WorkOrderDto>('/work-orders', {
        method: 'POST',
        body: input,
        schema: workOrderDtoSchema,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['work-orders'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
      ]);
    },
  });
}

export function useUpdateWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWorkOrderRequest }) =>
      api<WorkOrderDto>(`/work-orders/${id}`, {
        method: 'PATCH',
        body: input,
        schema: workOrderDtoSchema,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['work-orders'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      ]);
    },
  });
}

export function useWorkOrderAttachments(workOrderId: string | null) {
  return useQuery({
    queryKey: ['work-order-attachments', workOrderId],
    queryFn: () =>
      workOrderId
        ? api<WorkOrderAttachmentDto[]>(`/work-orders/${workOrderId}/attachments`, {
            schema: z.array(workOrderAttachmentSchema),
          })
        : [],
    enabled: Boolean(workOrderId),
  });
}

export function useUploadWorkOrderAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workOrderId,
      input,
    }: {
      workOrderId: string;
      input: UploadAttachmentRequest;
    }) =>
      api<WorkOrderAttachmentDto>(`/work-orders/${workOrderId}/attachments`, {
        method: 'POST',
        body: input,
        schema: workOrderAttachmentSchema,
      }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ['work-order-attachments', variables.workOrderId],
      });
    },
  });
}
