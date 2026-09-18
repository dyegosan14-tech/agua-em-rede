import { z } from 'zod';
import { dateTimeSchema, uuidSchema } from './common';

export const auditLogSchema = z.object({
  id: uuidSchema,
  action: z.string(),
  actorUserId: uuidSchema.nullable(),
  actorName: z.string().nullable(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  requestId: z.string().nullable(),
  ip: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: dateTimeSchema,
});
export type AuditLogDto = z.infer<typeof auditLogSchema>;

export const listAuditLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Cursor opaco devolvido em `nextCursor` (paginação por chave, estável mesmo com novas inserções). */
  cursor: z.string().min(1).max(200).optional(),
  action: z.string().trim().min(1).max(100).optional(),
  entityType: z.string().trim().min(1).max(100).optional(),
  from: dateTimeSchema.optional(),
  to: dateTimeSchema.optional(),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

export const listAuditLogsResponseSchema = z.object({
  items: z.array(auditLogSchema),
  nextCursor: z.string().nullable(),
});
