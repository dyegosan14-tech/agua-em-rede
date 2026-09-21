import { z } from 'zod';
import { dateTimeSchema, pageInfoSchema, paginationQuerySchema, uuidSchema } from './common';

export const maintenanceWindowSchema = z.object({
  id: uuidSchema,
  sectorId: uuidSchema.nullable(),
  deviceId: uuidSchema.nullable(),
  reason: z.string(),
  startsAt: dateTimeSchema,
  endsAt: dateTimeSchema,
  cancelledAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export type MaintenanceWindowDto = z.infer<typeof maintenanceWindowSchema>;

export const listMaintenanceWindowsQuerySchema = paginationQuerySchema.extend({
  sectorId: uuidSchema.optional(),
  deviceId: uuidSchema.optional(),
  activeAt: dateTimeSchema.optional(),
});
export type ListMaintenanceWindowsQuery = z.infer<typeof listMaintenanceWindowsQuerySchema>;

export const listMaintenanceWindowsResponseSchema = z.object({
  items: z.array(maintenanceWindowSchema),
  page: pageInfoSchema,
});
export type ListMaintenanceWindowsResponse = z.infer<typeof listMaintenanceWindowsResponseSchema>;

export const createMaintenanceWindowRequestSchema = z
  .object({
    sectorId: uuidSchema.optional().nullable(),
    deviceId: uuidSchema.optional().nullable(),
    reason: z.string().trim().min(3, 'Informe o motivo da manutenção.').max(500),
    startsAt: dateTimeSchema,
    endsAt: dateTimeSchema,
  })
  .refine((data) => Boolean(data.sectorId || data.deviceId), {
    message: 'Selecione ao menos um setor ou dispositivo para a manutenção.',
    path: ['sectorId'],
  })
  .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
    message: 'O horário de término deve ser posterior ao de início.',
    path: ['endsAt'],
  });
export type CreateMaintenanceWindowRequest = z.input<typeof createMaintenanceWindowRequestSchema>;
