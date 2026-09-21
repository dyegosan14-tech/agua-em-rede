import { DATA_ORIGINS, MEASUREMENT_QUALITIES, SIMULATION_SCENARIOS, SIMULATION_STATUSES } from '@aer/domain';
import { z } from 'zod';
import { dateTimeSchema, pageInfoSchema, paginationQuerySchema, uuidSchema } from './common';
import { metricSchema } from './devices';

export const measurementQualitySchema = z.enum(MEASUREMENT_QUALITIES);

export const dataOriginSchema = z.enum(DATA_ORIGINS);
export const simulationScenarioSchema = z.enum(SIMULATION_SCENARIOS);
export const simulationStatusSchema = z.enum(SIMULATION_STATUSES);

export const telemetryReadingInputSchema = z.object({
  deviceId: uuidSchema,
  metric: metricSchema,
  value: z.number(),
  unit: z.string().trim().min(1).max(20).optional(),
  measuredAt: dateTimeSchema,
  externalEventId: z.string().trim().max(100).optional(),
});
export type TelemetryReadingInput = z.infer<typeof telemetryReadingInputSchema>;

export const ingestTelemetryRequestSchema = z.object({
  items: z.array(telemetryReadingInputSchema).min(1, 'Envie ao menos uma medição.').max(1000),
});
export type IngestTelemetryRequest = z.infer<typeof ingestTelemetryRequestSchema>;

export const deviceTelemetryItemSchema = z.object({
  metric: metricSchema,
  value: z.number(),
  unit: z.string().trim().min(1).max(20).optional(),
  measuredAt: dateTimeSchema.optional(),
  externalEventId: z.string().trim().max(100).optional(),
});

export const deviceIngestTelemetryRequestSchema = z.object({
  items: z.array(deviceTelemetryItemSchema).min(1, 'Envie ao menos uma leitura.').max(100),
});
export type DeviceIngestTelemetryRequest = z.infer<typeof deviceIngestTelemetryRequestSchema>;

export const measurementDtoSchema = z.object({
  id: uuidSchema,
  deviceId: uuidSchema,
  sectorId: uuidSchema.nullable(),
  externalEventId: z.string(),
  metric: metricSchema,
  value: z.number(),
  unit: z.string(),
  quality: measurementQualitySchema,
  qualityFlags: z.array(z.string()),
  measuredAt: dateTimeSchema,
  receivedAt: dateTimeSchema,
  origin: dataOriginSchema,
  simulationRunId: uuidSchema.nullable(),
});
export type MeasurementDto = z.infer<typeof measurementDtoSchema>;

export const listMeasurementsQuerySchema = paginationQuerySchema.extend({
  deviceId: uuidSchema.optional(),
  sectorId: uuidSchema.optional(),
  metric: metricSchema.optional(),
  from: dateTimeSchema.optional(),
  to: dateTimeSchema.optional(),
});
export type ListMeasurementsQuery = z.infer<typeof listMeasurementsQuerySchema>;

export const listMeasurementsResponseSchema = z.object({
  items: z.array(measurementDtoSchema),
  page: pageInfoSchema,
});
export type ListMeasurementsResponse = z.infer<typeof listMeasurementsResponseSchema>;

export const runSimulationRequestSchema = z.object({
  scenario: simulationScenarioSchema.default('COMBINED_EVENT'),
  sectorId: uuidSchema.optional(),
  durationHours: z.number().int().min(1).max(72).default(24),
});
export type RunSimulationRequest = z.input<typeof runSimulationRequestSchema>;

export const simulationRunDtoSchema = z.object({
  id: uuidSchema,
  scenario: simulationScenarioSchema,
  seed: z.number(),
  status: simulationStatusSchema,
  sectorId: uuidSchema.nullable(),
  measurementsGenerated: z.number().int(),
  error: z.string().nullable(),
  startedAt: dateTimeSchema.nullable(),
  finishedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
});
export type SimulationRunDto = z.infer<typeof simulationRunDtoSchema>;
