import { ACTIVE_STATUSES, ASSET_KINDS } from '@aer/domain';
import { z } from 'zod';
import { dateTimeSchema, pageInfoSchema, paginationQuerySchema, uuidSchema } from './common';

export const assetKindSchema = z.enum(ASSET_KINDS);
export const assetStatusSchema = z.enum(ACTIVE_STATUSES);

export const networkAssetSchema = z.object({
  id: uuidSchema,
  sectorId: uuidSchema.nullable(),
  kind: assetKindSchema,
  code: z.string(),
  name: z.string(),
  geometry: z.any(),
  properties: z.record(z.string(), z.unknown()).default({}),
  status: assetStatusSchema,
  isFictional: z.boolean(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export type NetworkAssetDto = z.infer<typeof networkAssetSchema>;

export const listNetworkAssetsQuerySchema = paginationQuerySchema.extend({
  sectorId: uuidSchema.optional(),
  kind: assetKindSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
export type ListNetworkAssetsQuery = z.infer<typeof listNetworkAssetsQuerySchema>;

export const listNetworkAssetsResponseSchema = z.object({
  items: z.array(networkAssetSchema),
  page: pageInfoSchema,
});
export type ListNetworkAssetsResponse = z.infer<typeof listNetworkAssetsResponseSchema>;
