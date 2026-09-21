import { RULE_SCOPES } from '@aer/domain';
import { z } from 'zod';
import { ruleKindSchema, severitySchema } from './alerts';
import { dateTimeSchema, pageInfoSchema, paginationQuerySchema, uuidSchema } from './common';

export const ruleScopeSchema = z.enum(RULE_SCOPES);

export const detectionRuleSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  kind: ruleKindSchema,
  scopeType: ruleScopeSchema,
  sectorId: uuidSchema.nullable(),
  deviceId: uuidSchema.nullable(),
  params: z.record(z.string(), z.unknown()),
  windowSeconds: z.number().int(),
  minDurationSeconds: z.number().int(),
  minCoverageRatio: z.number(),
  severity: severitySchema,
  suppressionSeconds: z.number().int(),
  recoverySeconds: z.number().int(),
  respectSupplySchedule: z.boolean(),
  respectMaintenance: z.boolean(),
  isEnabled: z.boolean(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export type DetectionRuleDto = z.infer<typeof detectionRuleSchema>;

export const listDetectionRulesQuerySchema = paginationQuerySchema.extend({
  kind: ruleKindSchema.optional(),
  scopeType: ruleScopeSchema.optional(),
  sectorId: uuidSchema.optional(),
  deviceId: uuidSchema.optional(),
});
export type ListDetectionRulesQuery = z.infer<typeof listDetectionRulesQuerySchema>;

export const listDetectionRulesResponseSchema = z.object({
  items: z.array(detectionRuleSchema),
  page: pageInfoSchema,
});
export type ListDetectionRulesResponse = z.infer<typeof listDetectionRulesResponseSchema>;

export const createDetectionRuleRequestSchema = z.object({
  name: z.string().trim().min(3).max(200),
  description: z.string().trim().max(1000).optional(),
  kind: ruleKindSchema,
  scopeType: ruleScopeSchema.default('ORGANIZATION'),
  sectorId: uuidSchema.optional().nullable(),
  deviceId: uuidSchema.optional().nullable(),
  params: z.record(z.string(), z.unknown()).default({}),
  windowSeconds: z.number().int().min(60).max(86400).default(900),
  minDurationSeconds: z.number().int().min(0).max(86400).default(300),
  minCoverageRatio: z.number().min(0.1).max(1.0).default(0.7),
  severity: severitySchema.default('HIGH'),
  suppressionSeconds: z.number().int().min(0).max(86400).default(3600),
  recoverySeconds: z.number().int().min(0).max(86400).default(600),
  respectSupplySchedule: z.boolean().default(true),
  respectMaintenance: z.boolean().default(true),
  isEnabled: z.boolean().default(true),
});
export type CreateDetectionRuleRequest = z.infer<typeof createDetectionRuleRequestSchema>;
