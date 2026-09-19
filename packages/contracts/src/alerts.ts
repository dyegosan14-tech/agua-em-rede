import { ALERT_STATUSES, DATA_ORIGINS, RULE_KINDS, SEVERITIES } from '@aer/domain';
import { z } from 'zod';
import { dateTimeSchema, pageInfoSchema, paginationQuerySchema, uuidSchema } from './common';

export const alertStatusSchema = z.enum(ALERT_STATUSES);
export const severitySchema = z.enum(SEVERITIES);
export const ruleKindSchema = z.enum(RULE_KINDS);

export const alertDtoSchema = z.object({
  id: uuidSchema,
  ruleId: uuidSchema,
  sectorId: uuidSchema.nullable(),
  deviceId: uuidSchema.nullable(),
  dedupKey: z.string(),
  status: alertStatusSchema,
  severity: severitySchema,
  title: z.string(),
  priorityScore: z.number().int(),
  evidence: z.record(z.string(), z.unknown()),
  occurrences: z.number().int(),
  firstDetectedAt: dateTimeSchema,
  lastDetectedAt: dateTimeSchema,
  recoveryObservedAt: dateTimeSchema.nullable(),
  acknowledgedAt: dateTimeSchema.nullable(),
  acknowledgedBy: uuidSchema.nullable(),
  resolvedAt: dateTimeSchema.nullable(),
  resolvedBy: uuidSchema.nullable(),
  dismissedAt: dateTimeSchema.nullable(),
  dismissedBy: uuidSchema.nullable(),
  dismissalReason: z.string().nullable(),
  origin: z.enum(DATA_ORIGINS),
  simulationRunId: uuidSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export type AlertDto = z.infer<typeof alertDtoSchema>;

export const listAlertsQuerySchema = paginationQuerySchema.extend({
  status: alertStatusSchema.optional(),
  severity: severitySchema.optional(),
  sectorId: uuidSchema.optional(),
  deviceId: uuidSchema.optional(),
  origin: z.enum(DATA_ORIGINS).optional(),
});
export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;

export const listAlertsResponseSchema = z.object({
  items: z.array(alertDtoSchema),
  page: pageInfoSchema,
});
export type ListAlertsResponse = z.infer<typeof listAlertsResponseSchema>;

export const transitionAlertRequestSchema = z.object({
  action: z.enum(['ACKNOWLEDGE', 'INVESTIGATE', 'RESOLVE', 'DISMISS']),
  note: z.string().trim().max(1000).optional(),
  dismissalReason: z.string().trim().max(500).optional(),
});
export type TransitionAlertRequest = z.infer<typeof transitionAlertRequestSchema>;
