import { dashboardSummarySchema } from '@aer/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api('/dashboard/summary', { schema: dashboardSummarySchema }),
    refetchInterval: 30_000,
  });
}
