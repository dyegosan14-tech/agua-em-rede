import { DATA_ORIGINS, MEASUREMENT_QUALITIES, METRICS, SIMULATION_SCENARIOS, SIMULATION_STATUSES } from '@aer/domain';
import { bigint, doublePrecision, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAtColumn, tz, updatedAtColumn } from './columns';

export const simulationRuns = pgTable('simulation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  scenario: text('scenario', { enum: SIMULATION_SCENARIOS }).notNull(),
  seed: bigint('seed', { mode: 'number' }).notNull(),
  status: text('status', { enum: SIMULATION_STATUSES }).notNull().default('PENDING'),
  sectorId: uuid('sector_id'),
  params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
  startedAt: tz('started_at'),
  finishedAt: tz('finished_at'),
  measurementsGenerated: integer('measurements_generated').notNull().default(0),
  error: text('error'),
  createdBy: uuid('created_by'),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export const measurements = pgTable('measurements', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  deviceId: uuid('device_id').notNull(),
  sectorId: uuid('sector_id'),
  externalEventId: text('external_event_id').notNull(),
  metric: text('metric', { enum: METRICS }).notNull(),
  value: doublePrecision('value').notNull(),
  unit: text('unit').notNull(),
  quality: text('quality', { enum: MEASUREMENT_QUALITIES }).notNull(),
  qualityFlags: text('quality_flags').array().notNull().default([]),
  measuredAt: tz('measured_at').notNull(),
  receivedAt: tz('received_at').notNull().defaultNow(),
  origin: text('origin', { enum: DATA_ORIGINS }).notNull(),
  simulationRunId: uuid('simulation_run_id'),
});
