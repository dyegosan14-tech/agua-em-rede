import type { ListNetworkAssetsQuery, NetworkAssetDto } from '@aer/contracts';
import { networkAssets, type Executor } from '@aer/database';
import { and, asc, count, eq, ilike, isNull, or, type SQL } from 'drizzle-orm';

export type NetworkAssetRow = typeof networkAssets.$inferSelect;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export function toNetworkAssetDto(row: NetworkAssetRow): NetworkAssetDto {
  return {
    id: row.id,
    sectorId: row.sectorId,
    kind: row.kind as NetworkAssetDto['kind'],
    code: row.code,
    name: row.name,
    geometry: row.geometry,
    properties: (row.properties ?? {}) as Record<string, unknown>,
    status: row.status as NetworkAssetDto['status'],
    isFictional: row.isFictional,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listNetworkAssets(
  db: Executor,
  organizationId: string,
  query: ListNetworkAssetsQuery,
): Promise<{ rows: NetworkAssetRow[]; total: number }> {
  const conditions: (SQL | undefined)[] = [
    eq(networkAssets.organizationId, organizationId),
    isNull(networkAssets.archivedAt),
    query.sectorId ? eq(networkAssets.sectorId, query.sectorId) : undefined,
    query.kind ? eq(networkAssets.kind, query.kind) : undefined,
    query.search
      ? or(
          ilike(networkAssets.name, `%${escapeLike(query.search)}%`),
          ilike(networkAssets.code, `%${escapeLike(query.search)}%`),
        )
      : undefined,
  ];
  const where = and(...conditions);

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(networkAssets)
      .where(where)
      .orderBy(asc(networkAssets.kind), asc(networkAssets.name), asc(networkAssets.id))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(networkAssets).where(where),
  ]);

  return { rows, total: totals[0]?.total ?? 0 };
}

export async function findNetworkAsset(
  db: Executor,
  organizationId: string,
  assetId: string,
): Promise<NetworkAssetRow | null> {
  const [row] = await db
    .select()
    .from(networkAssets)
    .where(
      and(
        eq(networkAssets.id, assetId),
        eq(networkAssets.organizationId, organizationId),
        isNull(networkAssets.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
