import { ACTIVE_STATUSES, ASSET_KINDS, DEVICE_KINDS, METRICS } from '@aer/domain';
import type { Metric } from '@aer/domain';
import { boolean, doublePrecision, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAtColumn, geometryColumn, tz, updatedAtColumn } from './columns';

export interface SupplyScheduleEntry {
  /** 0 = domingo ... 6 = sábado (horário local da organização). */
  daysOfWeek: number[];
  /** HH:mm no fuso da organização. */
  start: string;
  end: string;
}

export const sectors = pgTable('sectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  geometry: geometryColumn('geometry', 'geometry(MultiPolygon,4326)'),
  supplySchedule: jsonb('supply_schedule').$type<SupplyScheduleEntry[]>().notNull().default([]),
  isFictional: boolean('is_fictional').notNull().default(false),
  archivedAt: tz('archived_at'),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export const networkAssets = pgTable('network_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  sectorId: uuid('sector_id'),
  kind: text('kind', { enum: ASSET_KINDS }).notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  geometry: geometryColumn('geometry', 'geometry(Geometry,4326)').notNull(),
  properties: jsonb('properties').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status', { enum: ACTIVE_STATUSES }).notNull().default('ACTIVE'),
  isFictional: boolean('is_fictional').notNull().default(false),
  archivedAt: tz('archived_at'),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  sectorId: uuid('sector_id'),
  assetId: uuid('asset_id'),
  code: text('code').notNull(),
  name: text('name').notNull(),
  kind: text('kind', { enum: DEVICE_KINDS }).notNull(),
  metrics: text('metrics', { enum: METRICS }).array().$type<Metric[]>().notNull(),
  location: geometryColumn('location', 'geometry(Point,4326)'),
  rangePressureMin: doublePrecision('range_pressure_min'),
  rangePressureMax: doublePrecision('range_pressure_max'),
  rangeFlowMin: doublePrecision('range_flow_min'),
  rangeFlowMax: doublePrecision('range_flow_max'),
  expectedIntervalSeconds: integer('expected_interval_seconds').notNull().default(300),
  status: text('status', { enum: ACTIVE_STATUSES }).notNull().default('ACTIVE'),
  lastMeasurementAt: tz('last_measurement_at'),
  lastReceivedAt: tz('last_received_at'),
  isFictional: boolean('is_fictional').notNull().default(false),
  archivedAt: tz('archived_at'),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export const deviceCredentials = pgTable('device_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  deviceId: uuid('device_id').notNull(),
  secretHash: text('secret_hash').notNull(),
  label: text('label'),
  createdBy: uuid('created_by'),
  createdAt: createdAtColumn(),
  expiresAt: tz('expires_at'),
  revokedAt: tz('revoked_at'),
  lastUsedAt: tz('last_used_at'),
});

export const maintenanceWindows = pgTable('maintenance_windows', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  sectorId: uuid('sector_id'),
  deviceId: uuid('device_id'),
  reason: text('reason').notNull(),
  startsAt: tz('starts_at').notNull(),
  endsAt: tz('ends_at').notNull(),
  createdBy: uuid('created_by'),
  cancelledAt: tz('cancelled_at'),
  archivedAt: tz('archived_at'),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});
