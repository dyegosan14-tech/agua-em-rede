import { kpiSummarySchema, type KpiSummaryDto } from '@aer/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function useKpiSummary() {
  return useQuery<KpiSummaryDto>({
    queryKey: ['analytics', 'kpi-summary'],
    queryFn: () => api('/analytics/kpis', { schema: kpiSummarySchema }),
    refetchInterval: 10000,
  });
}
