import { z } from 'zod';
import { dateTimeSchema, pageInfoSchema, paginationQuerySchema, uuidSchema } from './common';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const supplyScheduleEntrySchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, 'Selecione ao menos um dia da semana.'),
  start: z.string().regex(TIME_REGEX, 'Horário inicial inválido (use HH:mm).'),
  end: z.string().regex(TIME_REGEX, 'Horário final inválido (use HH:mm).'),
});
export type SupplyScheduleEntryDto = z.infer<typeof supplyScheduleEntrySchema>;

export const sectorSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  geometry: z.any().nullable().optional(),
  supplySchedule: z.array(supplyScheduleEntrySchema),
  isFictional: z.boolean(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export type SectorDto = z.infer<typeof sectorSchema>;

export const listSectorsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional(),
});
export type ListSectorsQuery = z.infer<typeof listSectorsQuerySchema>;

export const listSectorsResponseSchema = z.object({
  items: z.array(sectorSchema),
  page: pageInfoSchema,
});
export type ListSectorsResponse = z.infer<typeof listSectorsResponseSchema>;

export const createSectorRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'O código deve ter ao menos 2 caracteres.')
    .max(50, 'O código deve ter no máximo 50 caracteres.')
    .regex(/^[A-Za-z0-9_-]+$/, 'O código deve conter apenas letras, números, hífens ou sublinhados.'),
  name: z.string().trim().min(2, 'Informe o nome do setor.').max(200),
  description: z.string().trim().max(1000).optional(),
  supplySchedule: z.array(supplyScheduleEntrySchema).optional().default([]),
  isFictional: z.boolean().optional().default(false),
});
export type CreateSectorRequest = z.input<typeof createSectorRequestSchema>;


export const updateSectorRequestSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome do setor.').max(200).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    supplySchedule: z.array(supplyScheduleEntrySchema).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateSectorRequest = z.infer<typeof updateSectorRequestSchema>;
