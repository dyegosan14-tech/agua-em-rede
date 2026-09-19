import { DATA_ORIGINS, WORK_ORDER_DIAGNOSES, WORK_ORDER_PRIORITIES, WORK_ORDER_STATUSES } from '@aer/domain';
import { z } from 'zod';
import { dateTimeSchema, pageInfoSchema, paginationQuerySchema, uuidSchema } from './common';

export const workOrderStatusSchema = z.enum(WORK_ORDER_STATUSES);
export const workOrderPrioritySchema = z.enum(WORK_ORDER_PRIORITIES);
export const workOrderDiagnosisSchema = z.enum(WORK_ORDER_DIAGNOSES);

export const workOrderDtoSchema = z.object({
  id: uuidSchema,
  number: z.number().int(),
  alertId: uuidSchema.nullable(),
  sectorId: uuidSchema.nullable(),
  assetId: uuidSchema.nullable(),
  deviceId: uuidSchema.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  priority: workOrderPrioritySchema,
  status: workOrderStatusSchema,
  assignedTo: uuidSchema.nullable(),
  createdBy: uuidSchema,
  dueAt: dateTimeSchema.nullable(),
  assignedAt: dateTimeSchema.nullable(),
  inspectionStartedAt: dateTimeSchema.nullable(),
  completedAt: dateTimeSchema.nullable(),
  cancelledAt: dateTimeSchema.nullable(),
  cancellationReason: z.string().nullable(),
  diagnosis: workOrderDiagnosisSchema.nullable(),
  inspectionNotes: z.string().nullable(),
  repairNotes: z.string().nullable(),
  repairedAt: dateTimeSchema.nullable(),
  estimatedVolumeM3: z.number().nullable(),
  version: z.number().int(),
  origin: z.enum(DATA_ORIGINS),
  simulationRunId: uuidSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export type WorkOrderDto = z.infer<typeof workOrderDtoSchema>;

export const listWorkOrdersQuerySchema = paginationQuerySchema.extend({
  status: workOrderStatusSchema.optional(),
  priority: workOrderPrioritySchema.optional(),
  assignedTo: uuidSchema.optional(),
  sectorId: uuidSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
export type ListWorkOrdersQuery = z.infer<typeof listWorkOrdersQuerySchema>;

export const listWorkOrdersResponseSchema = z.object({
  items: z.array(workOrderDtoSchema),
  page: pageInfoSchema,
});
export type ListWorkOrdersResponse = z.infer<typeof listWorkOrdersResponseSchema>;

export const createWorkOrderRequestSchema = z.object({
  alertId: uuidSchema.optional().nullable(),
  sectorId: uuidSchema.optional().nullable(),
  deviceId: uuidSchema.optional().nullable(),
  title: z.string().trim().min(3, 'Informe o título da ordem de serviço.').max(200),
  description: z.string().trim().max(2000).optional(),
  priority: workOrderPrioritySchema.default('MEDIUM'),
  assignedTo: uuidSchema.optional().nullable(),
  dueAt: dateTimeSchema.optional().nullable(),
});
export type CreateWorkOrderRequest = z.input<typeof createWorkOrderRequestSchema>;

export const updateWorkOrderRequestSchema = z
  .object({
    status: workOrderStatusSchema.optional(),
    priority: workOrderPrioritySchema.optional(),
    assignedTo: uuidSchema.nullable().optional(),
    diagnosis: workOrderDiagnosisSchema.nullable().optional(),
    inspectionNotes: z.string().trim().max(2000).nullable().optional(),
    repairNotes: z.string().trim().max(2000).nullable().optional(),
    estimatedVolumeM3: z.number().min(0, 'O volume deve ser positivo.').nullable().optional(),
    cancellationReason: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateWorkOrderRequest = z.infer<typeof updateWorkOrderRequestSchema>;
