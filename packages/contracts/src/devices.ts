import { ACTIVE_STATUSES, DEVICE_KINDS, METRICS } from '@aer/domain';
import { z } from 'zod';
import { dateTimeSchema, pageInfoSchema, paginationQuerySchema, uuidSchema } from './common';

export const deviceKindSchema = z.enum(DEVICE_KINDS);
export const activeStatusSchema = z.enum(ACTIVE_STATUSES);
export const metricSchema = z.enum(METRICS);

export const deviceSchema = z.object({
  id: uuidSchema,
  sectorId: uuidSchema.nullable(),
  assetId: uuidSchema.nullable(),
  code: z.string(),
  name: z.string(),
  kind: deviceKindSchema,
  metrics: z.array(metricSchema),
  rangePressureMin: z.number().nullable(),
  rangePressureMax: z.number().nullable(),
  rangeFlowMin: z.number().nullable(),
  rangeFlowMax: z.number().nullable(),
  expectedIntervalSeconds: z.number().int(),
  status: activeStatusSchema,
  lastMeasurementAt: dateTimeSchema.nullable(),
  lastReceivedAt: dateTimeSchema.nullable(),
  isFictional: z.boolean(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export type DeviceDto = z.infer<typeof deviceSchema>;

export const listDevicesQuerySchema = paginationQuerySchema.extend({
  sectorId: uuidSchema.optional(),
  kind: deviceKindSchema.optional(),
  status: activeStatusSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
export type ListDevicesQuery = z.infer<typeof listDevicesQuerySchema>;

export const listDevicesResponseSchema = z.object({
  items: z.array(deviceSchema),
  page: pageInfoSchema,
});
export type ListDevicesResponse = z.infer<typeof listDevicesResponseSchema>;

export const createDeviceRequestSchema = z.object({
  sectorId: uuidSchema.optional().nullable(),
  assetId: uuidSchema.optional().nullable(),
  code: z
    .string()
    .trim()
    .min(2, 'O código deve ter ao menos 2 caracteres.')
    .max(50, 'O código deve ter no máximo 50 caracteres.')
    .regex(/^[A-Za-z0-9_-]+$/, 'O código deve conter apenas letras, números, hífens ou sublinhados.'),
  name: z.string().trim().min(2, 'Informe o nome do dispositivo.').max(200),
  kind: deviceKindSchema,
  metrics: z.array(metricSchema).min(1, 'Selecione ao menos uma métrica.'),
  rangePressureMin: z.number().optional().nullable(),
  rangePressureMax: z.number().optional().nullable(),
  rangeFlowMin: z.number().optional().nullable(),
  rangeFlowMax: z.number().optional().nullable(),
  expectedIntervalSeconds: z.number().int().min(10).max(86400).default(300),
  status: activeStatusSchema.default('ACTIVE'),
  isFictional: z.boolean().optional().default(false),
});
export type DeviceKind = z.infer<typeof deviceKindSchema>;
export type CreateDeviceRequest = z.input<typeof createDeviceRequestSchema>;


export const updateDeviceRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    sectorId: uuidSchema.nullable().optional(),
    assetId: uuidSchema.nullable().optional(),
    status: activeStatusSchema.optional(),
    rangePressureMin: z.number().nullable().optional(),
    rangePressureMax: z.number().nullable().optional(),
    rangeFlowMin: z.number().nullable().optional(),
    rangeFlowMax: z.number().nullable().optional(),
    expectedIntervalSeconds: z.number().int().min(10).max(86400).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateDeviceRequest = z.infer<typeof updateDeviceRequestSchema>;
