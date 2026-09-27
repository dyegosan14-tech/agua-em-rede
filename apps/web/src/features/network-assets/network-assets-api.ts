import {
  listNetworkAssetsResponseSchema,
  networkAssetSchema,
  type ListNetworkAssetsQuery,
  type NetworkAssetDto,
} from '@aer/contracts';

export type { NetworkAssetDto };
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export type NetworkAssetsFilter = Partial<Pick<ListNetworkAssetsQuery, 'sectorId' | 'kind' | 'search'>> & {
  limit?: number;
  offset?: number;
};

function toQueryString(filter: NetworkAssetsFilter): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function useNetworkAssets(filter: NetworkAssetsFilter = {}) {
  const finalFilter = { limit: 200, offset: 0, ...filter };
  return useQuery({
    queryKey: ['network-assets', finalFilter],
    queryFn: () =>
      api(`/network-assets?${toQueryString(finalFilter)}`, {
        schema: listNetworkAssetsResponseSchema,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useNetworkAsset(id: string | null) {
  return useQuery({
    queryKey: ['network-assets', id],
    queryFn: () => (id ? api(`/network-assets/${id}`, { schema: networkAssetSchema }) : null),
    enabled: Boolean(id),
  });
}
