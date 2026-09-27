import type { ListNetworkAssetsQuery, ListNetworkAssetsResponse, NetworkAssetDto } from '@aer/contracts';
import type { Db } from '@aer/database';
import { Errors } from '../../lib/errors';
import type { AuthContext } from '../auth/auth.service';
import * as repo from './network-assets.repository';

export interface NetworkAssetsServiceDeps {
  db: Db;
}

export class NetworkAssetsService {
  constructor(private readonly deps: NetworkAssetsServiceDeps) {}

  async list(auth: AuthContext, query: ListNetworkAssetsQuery): Promise<ListNetworkAssetsResponse> {
    const { rows, total } = await repo.listNetworkAssets(this.deps.db, auth.organizationId, query);
    return {
      items: rows.map(repo.toNetworkAssetDto),
      page: { limit: query.limit, offset: query.offset, total },
    };
  }

  async get(auth: AuthContext, assetId: string): Promise<NetworkAssetDto> {
    const asset = await repo.findNetworkAsset(this.deps.db, auth.organizationId, assetId);
    if (!asset) throw Errors.notFound('Ativo de rede');
    return repo.toNetworkAssetDto(asset);
  }
}
