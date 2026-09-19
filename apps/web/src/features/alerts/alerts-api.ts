import {
  alertDtoSchema,
  listAlertsResponseSchema,
  type AlertDto,
  type ListAlertsQuery,
  type TransitionAlertRequest,
} from '@aer/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export type AlertsFilter = Partial<Omit<ListAlertsQuery, 'limit' | 'offset'>> & {
  limit: number;
  offset: number;
};

function toQueryString(filter: AlertsFilter): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function useAlerts(filter: AlertsFilter) {
  return useQuery({
    queryKey: ['alerts', filter],
    queryFn: () => api(`/alerts?${toQueryString(filter)}`, { schema: listAlertsResponseSchema }),
    placeholderData: keepPreviousData,
    refetchInterval: 10000,
  });
}

export function useAlert(id: string | null) {
  return useQuery({
    queryKey: ['alerts', id],
    queryFn: () => (id ? api(`/alerts/${id}`, { schema: alertDtoSchema }) : null),
    enabled: Boolean(id),
  });
}

export function useTransitionAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, input }: { alertId: string; input: TransitionAlertRequest }) =>
      api<AlertDto>(`/alerts/${alertId}/transition`, {
        method: 'POST',
        body: input,
        schema: alertDtoSchema,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      ]);
    },
  });
}
